import type { DprStructuredData } from "@buildflow/domain/dpr/schema";
import type { ValidationIssue } from "@buildflow/domain/dpr/validate";
import { MATERIALS, containsAnyTerm, containsTerm } from "../src/site/lexicon";
import { parseNumberToken, tokenizeWithOffsets } from "../src/site/quantities";
import { sameUnit } from "../src/site/units";
import type { Expectation, Fixture, Slice } from "./fixtures";

/**
 * Scoring for the Hinglish eval suite (T3.4).
 *
 * Two independent judgements are produced for every fixture:
 *
 *   1. ASSERTIONS — did the extraction contain what the transcript actually says? These are
 *      graded per slice so a provider cannot hide a collapse on Hindi behind a good English
 *      average (rules.md §12: never optimise only for average quality).
 *
 *   2. CRITICAL ERRORS — did the extraction state something the transcript never said? An
 *      invented quantity, date, material or citation is release-blocking on its own, no
 *      matter how good the pass rate looks (rules.md §12: critical hallucinations are a
 *      release-blocking metric).
 */

export type AssertionKind =
  | "presence" | "quantity_unit" | "negation" | "terminology" | "absence" | "invention";

export type AssertionResult = {
  fixtureId: string;
  kind: AssertionKind;
  label: string;
  passed: boolean;
  detail?: string;
};

export type CriticalError = { fixtureId: string; code: string; detail: string };

export type FixtureScore = {
  fixtureId: string;
  slices: readonly Slice[];
  assertions: AssertionResult[];
  critical: CriticalError[];
};

const lower = (value: string): string => value.toLowerCase();

/** Every number the speaker actually said, digits and words alike. */
function spokenNumbers(transcript: string): Set<number> {
  const values = new Set<number>();
  for (const token of tokenizeWithOffsets(transcript)) {
    const value = parseNumberToken(token.text);
    if (value !== null) values.add(value);
  }
  return values;
}

function quantityMatches(
  data: DprStructuredData, expected: { value: string; unit: string },
): boolean {
  const target = Number(expected.value);
  const candidates: { value: string | null; unit: string | null }[] = [
    ...data.work_items.map((item) => item.quantity),
    ...data.materials.map((item) => item.quantity ?? { value: null, unit: null }),
  ];
  return candidates.some((candidate) =>
    candidate.value !== null
    && Number(candidate.value) === target
    && sameUnit(candidate.unit, expected.unit));
}

function sectionLength(data: DprStructuredData, section: string): number {
  const rows = (data as unknown as Record<string, unknown>)[section];
  return Array.isArray(rows) ? rows.length : 0;
}

function assertionsFor(
  fixture: Fixture, data: DprStructuredData,
): AssertionResult[] {
  const out: AssertionResult[] = [];
  const expect: Expectation = fixture.expect;
  const add = (kind: AssertionKind, label: string, passed: boolean, detail?: string) =>
    out.push({ fixtureId: fixture.id, kind, label, passed, detail });

  for (const keyword of expect.workItemKeywords ?? []) {
    add("presence", `work item mentions "${keyword}"`,
      data.work_items.some((item) => lower(item.description).includes(lower(keyword))));
  }

  for (const term of expect.terminology ?? []) {
    const found =
      term.kind === "activity" ? data.work_items.some((i) => i.activity === term.canonical)
      : term.kind === "material" ? data.materials.some((i) => i.name === term.canonical)
      : term.kind === "trade" ? data.labour.some((i) => i.trade === term.canonical)
      : data.equipment.some((i) => i.name === term.canonical);
    add("terminology", `${term.kind} "${term.canonical}" recognised`, found);
  }

  for (const quantity of expect.quantities ?? []) {
    add("quantity_unit", `quantity ${quantity.value} ${quantity.unit}`,
      quantityMatches(data, quantity));
  }

  for (const quantity of expect.workItemQuantities ?? []) {
    const target = Number(quantity.value);
    add("quantity_unit", `work item carries ${quantity.value} ${quantity.unit}`,
      data.work_items.some((item) =>
        item.quantity.value !== null
        && Number(item.quantity.value) === target
        && sameUnit(item.quantity.unit, quantity.unit)));
  }

  for (const material of expect.materials ?? []) {
    const rows = data.materials.filter((row) => row.name === material.name);
    if (material.status !== undefined) {
      add("presence", `material ${material.name} = ${material.status}`,
        rows.some((row) => row.status === material.status),
        rows.length === 0 ? "material absent" : `got ${rows.map((r) => r.status).join(",")}`);
    }
    if (material.notStatus) {
      // Absence counts as a pass: omitting the material is incomplete, but it is not the
      // dangerous failure. Reporting an undelivered material as received IS.
      const violating = rows.filter((row) => row.status !== null
        && material.notStatus!.includes(row.status));
      add("negation", `material ${material.name} not ${material.notStatus.join("/")}`,
        violating.length === 0,
        violating.length > 0 ? `got ${violating.map((r) => r.status).join(",")}` : undefined);
    }
  }

  for (const labour of expect.labour ?? []) {
    const row = data.labour.find((item) => item.trade === labour.trade);
    if (labour.count === undefined) {
      add("presence", `labour ${labour.trade} present`, row !== undefined);
    } else {
      add("quantity_unit", `labour ${labour.trade} = ${labour.count}`,
        row !== undefined && row.count === labour.count,
        row ? `got ${row.count}` : "trade absent");
    }
  }

  for (const machine of expect.equipment ?? []) {
    const row = data.equipment.find((item) => item.name === machine.name);
    const passed = machine.status === undefined
      ? row !== undefined
      : row !== undefined && row.status === machine.status;
    add("presence", `equipment ${machine.name}${machine.status ? ` = ${machine.status}` : ""}`,
      passed, row ? `got ${row.status}` : "equipment absent");
  }

  for (const section of expect.emptySections ?? []) {
    const length = sectionLength(data, section);
    add("absence", `${section} empty`, length === 0, length > 0 ? `got ${length} rows` : undefined);
  }

  if (expect.weather) {
    const present = data.weather_site_condition.value !== null;
    add(expect.weather === "present" ? "presence" : "absence",
      `weather ${expect.weather}`, present === (expect.weather === "present"));
  }
  if (expect.blockers) {
    const present = data.blockers.length > 0;
    add(expect.blockers === "present" ? "presence" : "absence",
      `blockers ${expect.blockers}`, present === (expect.blockers === "present"));
  }
  if (expect.tomorrowPlan) {
    const present = data.tomorrow_plan.length > 0;
    add(expect.tomorrowPlan === "present" ? "presence" : "absence",
      `tomorrow plan ${expect.tomorrowPlan}`, present === (expect.tomorrowPlan === "present"));
  }
  if (expect.noSupportedWorkItems) {
    const supported = data.work_items.filter((item) => item.confidence_band === "Supported");
    add("absence", "no work item claimed as Supported", supported.length === 0,
      supported.length > 0 ? `${supported.length} Supported` : undefined);
  }

  for (const forbidden of expect.forbidden ?? []) {
    add("invention", `does not state "${forbidden}"`, !statesForbidden(fixture, data, forbidden));
  }

  return out;
}

/**
 * Structured CLAIM fields — the places where a string is an assertion about the world.
 * Deliberately excludes narrative and quotes, which are supposed to echo the speaker.
 */
function claimValues(data: DprStructuredData): string[] {
  const values: (string | number | null)[] = [];
  for (const item of data.work_items) {
    values.push(item.location, item.activity, item.quantity.value, item.quantity.unit);
  }
  for (const item of data.labour) values.push(item.trade, item.count);
  for (const item of data.materials) {
    values.push(item.name, item.status, item.quantity?.value ?? null, item.quantity?.unit ?? null, item.unit);
  }
  for (const item of data.equipment) values.push(item.name, item.status);
  for (const item of data.blockers) values.push(item.cause, item.owner, item.expected_resolution);
  values.push(data.weather_site_condition.value);
  return values.filter((value): value is string | number => value !== null && value !== undefined)
    .map((value) => String(value));
}

/** Narrative fields, which legitimately quote the recording word for word. */
function narrativeText(data: DprStructuredData): string {
  return [
    ...data.work_items.map((item) => item.description),
    ...data.materials.map((item) => item.name),
    ...data.blockers.map((item) => item.description),
    ...data.safety_quality.map((item) => item.note),
    ...data.tomorrow_plan.map((item) => item.item),
  ].join(" ");
}

/**
 * "Did the extraction STATE this?" A forbidden string in a claim field is always a failure.
 * In narrative it is only a failure when the speaker never said it — repeating the
 * engineer's own words back is required behaviour, not invention.
 */
function statesForbidden(fixture: Fixture, data: DprStructuredData, forbidden: string): boolean {
  const needle = lower(forbidden);
  if (claimValues(data).some((value) => lower(value).includes(needle))) return true;
  if (lower(fixture.transcript).includes(needle)) return false;
  return lower(narrativeText(data)).includes(needle);
}

function criticalErrorsFor(
  fixture: Fixture, data: DprStructuredData, issues: ValidationIssue[],
): CriticalError[] {
  const out: CriticalError[] = [];
  const transcript = fixture.transcript;
  const transcriptLower = lower(transcript);
  const numbers = spokenNumbers(transcript);
  const push = (code: string, detail: string) => out.push({ fixtureId: fixture.id, code, detail });

  const checkNumber = (value: string | null | undefined, where: string) => {
    if (value === null || value === undefined) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    if (!numbers.has(numeric)) push("invented_quantity", `${where} = ${value} was never spoken`);
  };

  data.work_items.forEach((item, index) => checkNumber(item.quantity.value, `work_items[${index}]`));
  data.materials.forEach((item, index) => checkNumber(item.quantity?.value ?? null, `materials[${index}]`));
  data.labour.forEach((item, index) => {
    if (item.count !== null && !numbers.has(item.count)) {
      push("invented_labour_count", `labour[${index}] ${item.trade} = ${item.count} was never spoken`);
    }
  });

  data.materials.forEach((item, index) => {
    const entry = MATERIALS.find((candidate) => candidate.canonical === item.name);
    const spoken = entry
      ? containsAnyTerm(transcriptLower, entry.terms)
      : containsTerm(transcriptLower, item.name);
    if (!spoken) push("invented_material", `materials[${index}] "${item.name}" is not in the transcript`);
  });

  for (const isoDate of JSON.stringify(data).match(/\d{4}-\d{2}-\d{2}/g) ?? []) {
    if (!transcript.includes(isoDate)) push("invented_date", `date ${isoDate} is not in the transcript`);
  }

  for (const forbidden of fixture.expect.forbidden ?? []) {
    if (statesForbidden(fixture, data, forbidden)) {
      push("invented_value", `stated "${forbidden}", which the transcript does not support`);
    }
  }

  for (const issue of issues) {
    if (issue.code === "quote_not_in_transcript") {
      push("fabricated_citation", `${issue.path} cited words that are not in the transcript`);
    }
  }

  return out;
}

export function scoreFixture(input: {
  fixture: Fixture;
  data: DprStructuredData;
  issues: ValidationIssue[];
}): FixtureScore {
  return {
    fixtureId: input.fixture.id,
    slices: input.fixture.slices,
    assertions: assertionsFor(input.fixture, input.data),
    critical: criticalErrorsFor(input.fixture, input.data, input.issues),
  };
}

export type Tally = { passed: number; total: number; rate: number };

export function tally(results: { passed: boolean }[]): Tally {
  const passed = results.filter((result) => result.passed).length;
  return { passed, total: results.length, rate: results.length === 0 ? 1 : passed / results.length };
}

export type EvalReport = {
  provider: string;
  model: string;
  promptVersion: string;
  fixtureCount: number;
  overall: Tally;
  fixturesFullyPassing: Tally;
  criticalErrors: CriticalError[];
  bySlice: Record<string, Tally>;
  byKind: Record<string, Tally>;
  failures: AssertionResult[];
  /** Fixtures whose provider output could not be parsed at all. */
  schemaFailures: { fixtureId: string; message: string }[];
};

export function buildReport(input: {
  provider: string; model: string; promptVersion: string;
  scores: FixtureScore[];
  schemaFailures: { fixtureId: string; message: string }[];
}): EvalReport {
  const assertions = input.scores.flatMap((score) => score.assertions);
  const bySlice: Record<string, Tally> = {};
  const sliceBuckets = new Map<string, AssertionResult[]>();
  for (const score of input.scores) {
    for (const slice of score.slices) {
      const bucket = sliceBuckets.get(slice) ?? [];
      bucket.push(...score.assertions);
      sliceBuckets.set(slice, bucket);
    }
  }
  for (const [slice, bucket] of [...sliceBuckets].sort(([a], [b]) => a.localeCompare(b))) {
    bySlice[slice] = tally(bucket);
  }

  const byKind: Record<string, Tally> = {};
  const kindBuckets = new Map<string, AssertionResult[]>();
  for (const assertion of assertions) {
    const bucket = kindBuckets.get(assertion.kind) ?? [];
    bucket.push(assertion);
    kindBuckets.set(assertion.kind, bucket);
  }
  for (const [kind, bucket] of [...kindBuckets].sort(([a], [b]) => a.localeCompare(b))) {
    byKind[kind] = tally(bucket);
  }

  const fullyPassing = input.scores.map((score) => ({
    passed: score.assertions.every((assertion) => assertion.passed) && score.critical.length === 0,
  }));

  return {
    provider: input.provider,
    model: input.model,
    promptVersion: input.promptVersion,
    fixtureCount: input.scores.length + input.schemaFailures.length,
    overall: tally(assertions),
    fixturesFullyPassing: tally(fullyPassing),
    criticalErrors: input.scores.flatMap((score) => score.critical),
    bySlice,
    byKind,
    failures: assertions.filter((assertion) => !assertion.passed),
    schemaFailures: input.schemaFailures,
  };
}
