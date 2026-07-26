import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { dprSchema } from "@buildflow/domain/dpr/schema";
import { runDeterministicValidations } from "@buildflow/domain/dpr/validate";
import { getAiRegistry } from "../src/registry";
import type { TranscriptResult } from "../src/ports";
import { FIXTURES, type Fixture } from "./fixtures";
import { buildReport, scoreFixture, type EvalReport, type FixtureScore } from "./score";

/**
 * Hinglish eval runner (T3.4) — `pnpm --filter @buildflow/ai eval`.
 *
 * Scores whichever provider `AI_PROVIDER` selects. With the default mock it is fully
 * offline, deterministic and safe to run in CI; with `AI_PROVIDER=gemini` it runs the same
 * fixtures against the real model.
 *
 * The gate (see `baseline.json`) is deliberately two-sided: a provider must not REGRESS on
 * any measured slice, and it must produce ZERO critical errors. A high average with one
 * invented quantity is a failing run (rules.md §12).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(HERE, "baseline.json");

type Thresholds = {
  maxCriticalErrors: number;
  minAssertionRate: number;
  minFixtureRate: number;
  slices: Record<string, number>;
  measured?: boolean;
  note?: string;
};

type BaselineFile = Record<string, Thresholds>;

function loadBaseline(): BaselineFile {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as BaselineFile;
  } catch {
    return {};
  }
}

/** One segment spanning the clip: the span is a navigation hint, not a measurement. */
function asTranscript(fixture: Fixture): TranscriptResult {
  return {
    text: fixture.transcript,
    language: fixture.language,
    segments: [{ text: fixture.transcript, startMs: 0, endMs: fixture.durationMs ?? 0 }],
  };
}

const percent = (rate: number): string => `${(rate * 100).toFixed(1)}%`;
const pad = (value: string, width: number): string => value.padEnd(width, " ");

function printReport(report: EvalReport): void {
  const lines: string[] = [];
  lines.push("");
  lines.push("BuildFlow DPR extraction eval — Hinglish site updates");
  lines.push(`provider=${report.provider}  model=${report.model}  prompt=${report.promptVersion}`);
  lines.push(
    `fixtures=${report.fixtureCount}  assertions=${report.overall.total}`,
  );
  lines.push("");
  lines.push(`Assertions passed : ${report.overall.passed}/${report.overall.total} (${percent(report.overall.rate)})`);
  lines.push(`Fixtures clean    : ${report.fixturesFullyPassing.passed}/${report.fixturesFullyPassing.total} (${percent(report.fixturesFullyPassing.rate)})`);
  lines.push(`Critical errors   : ${report.criticalErrors.length}  (invented quantity/date/material/citation)`);
  lines.push("");

  lines.push("By slice");
  for (const [slice, result] of Object.entries(report.bySlice)) {
    lines.push(`  ${pad(slice, 16)} ${pad(`${result.passed}/${result.total}`, 10)} ${percent(result.rate)}`);
  }
  lines.push("");
  lines.push("By assertion kind");
  for (const [kind, result] of Object.entries(report.byKind)) {
    lines.push(`  ${pad(kind, 16)} ${pad(`${result.passed}/${result.total}`, 10)} ${percent(result.rate)}`);
  }

  if (report.criticalErrors.length > 0) {
    lines.push("");
    lines.push("CRITICAL ERRORS");
    for (const error of report.criticalErrors) {
      lines.push(`  [${error.fixtureId}] ${error.code}: ${error.detail}`);
    }
  }

  if (report.schemaFailures.length > 0) {
    lines.push("");
    lines.push("SCHEMA FAILURES (provider output rejected)");
    for (const failure of report.schemaFailures) {
      lines.push(`  [${failure.fixtureId}] ${failure.message}`);
    }
  }

  if (report.failures.length > 0) {
    lines.push("");
    lines.push(`Failed assertions (${report.failures.length})`);
    for (const failure of report.failures) {
      const detail = failure.detail ? ` — ${failure.detail}` : "";
      lines.push(`  [${failure.fixtureId}] ${failure.kind}: ${failure.label}${detail}`);
    }
  }

  lines.push("");
  console.log(lines.join("\n"));
}

export async function runEval(): Promise<EvalReport> {
  const ai = getAiRegistry();
  const scores: FixtureScore[] = [];
  const schemaFailures: { fixtureId: string; message: string }[] = [];

  for (const fixture of FIXTURES) {
    const transcript = asTranscript(fixture);
    try {
      // The same central gate the pipeline applies: unparseable output is a hard failure,
      // never a silently empty report.
      const extracted = dprSchema.parse(await ai.extraction.extract({ transcript }));
      const { data, issues } = runDeterministicValidations(extracted, fixture.transcript, {
        durationMs: fixture.durationMs ?? null,
        transcriptText: fixture.transcript,
      });
      scores.push(scoreFixture({ fixture, data, issues }));
    } catch (error) {
      schemaFailures.push({
        fixtureId: fixture.id,
        message: error instanceof Error ? error.message.split("\n")[0] : String(error),
      });
    }
  }

  return buildReport({
    provider: ai.extraction.meta.provider,
    model: ai.extraction.meta.model,
    promptVersion: ai.extraction.meta.promptVersion,
    scores,
    schemaFailures,
  });
}

/** Gate decision, separated from IO so tests can assert on it. */
export function evaluateGate(report: EvalReport, thresholds: Thresholds | undefined): string[] {
  const problems: string[] = [];
  if (report.schemaFailures.length > 0) {
    problems.push(`${report.schemaFailures.length} fixture(s) produced output that failed schema validation`);
  }
  if (!thresholds) {
    // No recorded expectation for this provider: report the numbers, do not invent a bar.
    return problems;
  }
  if (report.criticalErrors.length > thresholds.maxCriticalErrors) {
    problems.push(
      `${report.criticalErrors.length} critical error(s), limit ${thresholds.maxCriticalErrors}`,
    );
  }
  if (report.overall.rate < thresholds.minAssertionRate) {
    problems.push(
      `assertion pass rate ${percent(report.overall.rate)} below baseline ${percent(thresholds.minAssertionRate)}`,
    );
  }
  if (report.fixturesFullyPassing.rate < thresholds.minFixtureRate) {
    problems.push(
      `clean-fixture rate ${percent(report.fixturesFullyPassing.rate)} below baseline ${percent(thresholds.minFixtureRate)}`,
    );
  }
  for (const [slice, minimum] of Object.entries(thresholds.slices ?? {})) {
    const measured = report.bySlice[slice];
    if (measured && measured.rate < minimum) {
      problems.push(`slice "${slice}" ${percent(measured.rate)} below baseline ${percent(minimum)}`);
    }
  }
  return problems;
}

/** Always round DOWN: a recorded bar must never sit above the run that produced it. */
const floor4 = (rate: number): number => Math.floor(rate * 10_000) / 10_000;

function thresholdsFrom(report: EvalReport): Thresholds {
  const slices: Record<string, number> = {};
  for (const [slice, result] of Object.entries(report.bySlice)) {
    slices[slice] = floor4(result.rate);
  }
  return {
    maxCriticalErrors: 0,
    minAssertionRate: floor4(report.overall.rate),
    minFixtureRate: floor4(report.fixturesFullyPassing.rate),
    slices,
    measured: true,
    note: `recorded from ${report.provider}/${report.model} on ${new Date().toISOString().slice(0, 10)}`,
  };
}

async function main(): Promise<void> {
  const report = await runEval();
  const asJson = process.argv.includes("--json");
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  const baseline = loadBaseline();
  if (process.argv.includes("--update-baseline")) {
    baseline[report.provider] = thresholdsFrom(report);
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    console.log(`baseline updated for provider "${report.provider}"`);
    return;
  }

  const problems = evaluateGate(report, baseline[report.provider]);
  if (problems.length > 0) {
    console.error(`\nEVAL GATE FAILED:\n${problems.map((p) => `  - ${p}`).join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  if (!baseline[report.provider]) {
    console.log(`No baseline recorded for provider "${report.provider}" — numbers reported, gate not enforced.`);
    console.log("Record one with: pnpm --filter @buildflow/ai eval -- --update-baseline");
  } else {
    console.log("EVAL GATE PASSED");
  }
}

// Executed directly (`tsx evals/run.ts`), not when imported by a test.
const invokedDirectly = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  await main();
}
