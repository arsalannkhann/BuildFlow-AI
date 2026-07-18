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
