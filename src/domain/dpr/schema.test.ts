import { expect, test } from "vitest";
import { dprSchema, DPR_SCHEMA_VERSION, type DprStructuredData } from "./schema";

const valid: DprStructuredData = {
  schema_version: DPR_SCHEMA_VERSION,
  work_items: [{
    description: "Cast column C4", location: "Tower A / L3", activity: "RCC",
    quantity: { value: "2.5", unit: "cum" },
    source_refs: [{ transcript_span: { startMs: 1000, endMs: 4000 } }],
    confidence_band: "Supported",
  }],
  labour: [{ trade: "mason", count: 6, source_refs: [], confidence_band: "Supported" }],
  materials: [], equipment: [], safety_quality: [], blockers: [],
  weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" },
  tomorrow_plan: [{ item: "Slab shuttering", source_refs: [], confidence_band: "Check" }],
};

test("accepts a valid DPR", () => {
  expect(() => dprSchema.parse(valid)).not.toThrow();
});

test("null quantity value is allowed (never invented)", () => {
  const d = structuredClone(valid);
  d.work_items[0].quantity = { value: null, unit: null };
  expect(() => dprSchema.parse(d)).not.toThrow();
});

test("rejects an invalid confidence band", () => {
  const d = structuredClone(valid) as any;
  d.labour[0].confidence_band = "0.47";
  expect(() => dprSchema.parse(d)).toThrow();
});

test("rejects unknown material status", () => {
  const d = structuredClone(valid) as any;
  d.materials = [{ name: "cement", status: "teleported", quantity: null, unit: null, source_refs: [], confidence_band: "Check" }];
  expect(() => dprSchema.parse(d)).toThrow();
});
