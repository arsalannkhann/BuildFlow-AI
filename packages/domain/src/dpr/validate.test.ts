import { expect, test } from "vitest";
import { runDeterministicValidations } from "./validate";
import { DPR_SCHEMA_VERSION, type DprStructuredData } from "./schema";

const emptyDpr = (): DprStructuredData => ({
  schema_version: DPR_SCHEMA_VERSION, work_items: [], labour: [], materials: [],
  equipment: [], safety_quality: [], blockers: [],
  weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" },
  tomorrow_plan: [],
});

test("quantity value without a unit is downgraded to Check with an issue", () => {
  const d = emptyDpr();
  d.work_items.push({ description: "wall", location: null, activity: null,
    quantity: { value: "10", unit: null }, source_refs: [], confidence_band: "Supported" });
  const { data, issues } = runDeterministicValidations(d);
  expect(data.work_items[0].confidence_band).toBe("Check");
  expect(issues.some((i) => i.code === "quantity_missing_unit")).toBe(true);
});

test("clean data produces no issues and preserves bands", () => {
  const d = emptyDpr();
  d.work_items.push({ description: "wall", location: null, activity: null,
    quantity: { value: "10", unit: "sqm" }, source_refs: [{ transcript_span: { startMs: 0, endMs: 1 } }],
    confidence_band: "Supported" });
  const { data, issues } = runDeterministicValidations(d);
  expect(issues).toHaveLength(0);
  expect(data.work_items[0].confidence_band).toBe("Supported");
});

// --- verifiable quote anchors ---

const TRANSCRIPT = "Today we completed casting of column C4 on level 3, about 2.5 cubic meters " +
  "of concrete. Six masons and four helpers worked. Cement delivery is delayed.";

function dataWithQuote(quote: string): DprStructuredData {
  return {
    schema_version: DPR_SCHEMA_VERSION,
    work_items: [{
      description: "Casting of column C4", location: null, activity: null,
      quantity: { value: "2.5", unit: "cum" },
      source_refs: [{ quote }], confidence_band: "Supported",
    }],
    labour: [], materials: [], equipment: [], safety_quality: [], blockers: [],
    weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" },
    tomorrow_plan: [],
  };
}

test("a quote that occurs in the transcript is kept and stays Supported", () => {
  const { data, issues } = runDeterministicValidations(
    dataWithQuote("completed casting of column C4"), TRANSCRIPT);
  expect(data.work_items[0].source_refs[0].quote).toBe("completed casting of column C4");
  expect(data.work_items[0].confidence_band).toBe("Supported");
  expect(issues).toHaveLength(0);
});

test("quote matching tolerates reflowed whitespace, casing and smart punctuation", () => {
  const { data } = runDeterministicValidations(
    dataWithQuote("Completed   casting\nof column C4"), TRANSCRIPT);
  expect(data.work_items[0].source_refs[0].quote).toBeDefined();
  expect(data.work_items[0].confidence_band).toBe("Supported");
});

test("a fabricated quote is removed and the item drops to Check", () => {
  const { data, issues } = runDeterministicValidations(
    dataWithQuote("poured 40 cubic meters on the roof slab"), TRANSCRIPT);
  expect(data.work_items[0].source_refs[0].quote).toBeUndefined();
  expect(data.work_items[0].confidence_band).toBe("Check");
  expect(issues.map((i) => i.code)).toContain("quote_not_in_transcript");
  // The claim itself survives — it is the engineer's report, only the citation was bogus.
  expect(data.work_items[0].description).toBe("Casting of column C4");
});

test("a quote too short to prove anything is rejected", () => {
  const { data, issues } = runDeterministicValidations(dataWithQuote("C4"), TRANSCRIPT);
  expect(data.work_items[0].source_refs[0].quote).toBeUndefined();
  expect(issues.map((i) => i.code)).toContain("quote_too_short");
});

test("with no transcript available, no quote can be verified", () => {
  const { data, issues } = runDeterministicValidations(
    dataWithQuote("completed casting of column C4"), null);
  expect(data.work_items[0].source_refs[0].quote).toBeUndefined();
  expect(data.work_items[0].confidence_band).toBe("Check");
  expect(issues).toHaveLength(1);
});
