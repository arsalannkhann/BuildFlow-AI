import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { FIXTURES } from "../evals/fixtures";
import { evaluateGate, runEval } from "../evals/run";

const BASELINE = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../evals/baseline.json"), "utf8"),
) as Record<string, Parameters<typeof evaluateGate>[1]>;

test("the eval suite is large enough and stays synthetic", () => {
  expect(FIXTURES.length).toBeGreaterThanOrEqual(25);
  // Every case explains itself, so a failure is diagnosable without archaeology.
  for (const fixture of FIXTURES) {
    expect(fixture.notes.length).toBeGreaterThan(20);
    expect(fixture.transcript.trim().length).toBeGreaterThan(0);
    expect(fixture.slices.length).toBeGreaterThan(0);
  }
  const ids = FIXTURES.map((fixture) => fixture.id);
  expect(new Set(ids).size).toBe(ids.length);
  // Required coverage per the release gate.
  const slices = new Set(FIXTURES.flatMap((fixture) => fixture.slices));
  for (const required of ["english", "hindi", "hinglish", "noise", "terminology", "quantity", "negation", "dates", "contradiction"]) {
    expect(slices.has(required as never)).toBe(true);
  }
});

test("the eval runner passes against the mock provider and reports per-slice numbers", async () => {
  const report = await runEval();

  expect(report.provider).toBe("mock");
  expect(report.schemaFailures).toEqual([]);
  // Invention is release-blocking regardless of pass rates (rules.md §12).
  expect(report.criticalErrors).toEqual([]);

  for (const slice of ["english", "hindi", "hinglish", "negation", "quantity", "terminology", "noise"]) {
    expect(report.bySlice[slice]?.total ?? 0).toBeGreaterThan(0);
  }
  for (const kind of ["presence", "quantity_unit", "negation", "terminology", "absence", "invention"]) {
    expect(report.byKind[kind]?.total ?? 0).toBeGreaterThan(0);
  }

  // The gate itself must pass against the recorded baseline.
  expect(evaluateGate(report, BASELINE.mock)).toEqual([]);
}, 60_000);

test("the gate fails loudly on a critical error, however good the average looks", () => {
  const perfect = {
    provider: "mock", model: "m", promptVersion: "p", fixtureCount: 1,
    overall: { passed: 100, total: 100, rate: 1 },
    fixturesFullyPassing: { passed: 1, total: 1, rate: 1 },
    criticalErrors: [{ fixtureId: "x", code: "invented_quantity", detail: "12 cum was never spoken" }],
    bySlice: {}, byKind: {}, failures: [], schemaFailures: [],
  };
  const problems = evaluateGate(perfect, BASELINE.mock);
  expect(problems.join(" ")).toContain("critical error");
});
