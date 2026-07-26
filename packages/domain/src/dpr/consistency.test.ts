import { describe, expect, test } from "vitest";
import { DPR_SCHEMA_VERSION, dprSchema, type DprStructuredData } from "./schema";
import { checkConsistency } from "./consistency";

/**
 * Every rule is a QUESTION for the reviewer, never a verdict. These tests pin two things: the
 * rule fires on the contradiction it is meant to catch, and it stays silent on a clean report
 * so the review screen is not cried wolf at.
 */

const supported = { source_refs: [], confidence_band: "Supported" as const };

function dpr(over: Partial<DprStructuredData>): DprStructuredData {
  return {
    schema_version: DPR_SCHEMA_VERSION,
    work_items: [], labour: [], materials: [], equipment: [], safety_quality: [],
    blockers: [], tomorrow_plan: [],
    weather_site_condition: { value: null, ...supported },
    ...over,
  };
}

const codes = (data: DprStructuredData, previous?: DprStructuredData | null): string[] =>
  checkConsistency(data, { previous }).map((f) => f.code);

test("a report with a pour but no binder is flagged", () => {
  const data = dpr({
    work_items: [{
      description: "column casting on level 3", location: "L3", activity: "concreting",
      quantity: { value: "2.5", unit: "cum" }, ...supported,
    }],
    materials: [{ name: "sariya", status: "used", quantity: null, unit: null, ...supported }],
  });
  expect(codes(data)).toContain("concrete_without_binder");
});

test("the same pour with cement present is clean", () => {
  const data = dpr({
    work_items: [{
      description: "dhalai", location: "L3", activity: "concreting",
      quantity: { value: "2.5", unit: "cum" }, ...supported,
    }],
    materials: [{ name: "cement", status: "used", quantity: null, unit: null, ...supported }],
  });
  expect(codes(data)).not.toContain("concrete_without_binder");
});

test("ready-mix concrete counts as a binder — the pour is not double-flagged", () => {
  const data = dpr({
    work_items: [{
      description: "slab casting", location: "roof", activity: "slab work",
      quantity: { value: "40", unit: "cum" }, ...supported,
    }],
    materials: [{ name: "RMC", status: "received", quantity: null, unit: null, ...supported }],
    // slab casting resolves to a pour via "casting"; RMC satisfies the binder.
    labour: [{ trade: "mason", count: 4, ...supported }],
  });
  expect(codes(data)).not.toContain("concrete_without_binder");
});

test("reinforcement or shuttering work alone is not treated as a pour", () => {
  const data = dpr({
    work_items: [{
      description: "bar bending and binding", location: "L3", activity: "reinforcement",
      quantity: { value: "1.2", unit: "MT" }, ...supported,
    }],
    materials: [{ name: "tmt steel", status: "used", quantity: null, unit: null, ...supported }],
    labour: [{ trade: "bar bender", count: 3, ...supported }],
  });
  expect(codes(data)).not.toContain("concrete_without_binder");
});

test("idle plant with no reason is flagged; with a reason it is not", () => {
  const idleNoReason = dpr({
    equipment: [{ name: "excavator", status: "used", idle_hours: 4, active_hours: 2, ...supported }],
  });
  expect(codes(idleNoReason)).toContain("idle_plant_without_reason");

  const idleWithReason = dpr({
    equipment: [{
      name: "excavator", status: "used", idle_hours: 4, active_hours: 2,
      idle_reason: "waiting for RMC truck", ...supported,
    }],
  });
  expect(codes(idleWithReason)).not.toContain("idle_plant_without_reason");
});

test("plant logging more than a day is flagged", () => {
  const data = dpr({
    equipment: [{ name: "crane", status: "used", active_hours: 20, idle_hours: 8, ...supported }],
  });
  expect(codes(data)).toContain("plant_hours_exceed_day");
});

test("adverse weather without a measured reading is flagged", () => {
  const data = dpr({
    weather_site_condition: { value: "heavy rain stopped work after lunch", ...supported },
    work_items: [{
      description: "excavation", location: "block A", activity: "excavation",
      quantity: { value: null, unit: null }, ...supported,
    }],
    labour: [{ trade: "helper", count: 5, ...supported }],
  });
  expect(codes(data)).toContain("adverse_weather_without_measurement");
});

test("adverse weather WITH a measured interval is not flagged", () => {
  const data = dpr({
    weather_site_condition: { value: "heavy rain", ...supported },
    environmental_conditions: [
      { time_label: "12:00", temperature_c: 24, wind_beaufort: 5, rainfall_mm: 18, impact_on_work: true, ...supported },
    ],
    labour: [{ trade: "helper", count: 5, ...supported }],
  });
  expect(codes(data)).not.toContain("adverse_weather_without_measurement");
});

test("work with no labour and no plant is nudged for completeness", () => {
  const data = dpr({
    work_items: [{
      description: "plastering", location: "flat 402", activity: "plaster",
      quantity: { value: "60", unit: "sqm" }, ...supported,
    }],
    materials: [{ name: "cement", status: "used", quantity: null, unit: null, ...supported }],
  });
  expect(codes(data)).toContain("work_without_resources");
});

describe("prior-day equipment carryover", () => {
  const yesterday = dpr({
    equipment: [{ name: "JCB", status: "unavailable", ...supported }],
  });

  test("a machine down yesterday and running today with no repair note is flagged", () => {
    const today = dpr({
      equipment: [{ name: "excavator", status: "used", ...supported }], // JCB == excavator
      labour: [{ trade: "operator", count: 1, ...supported }],
    });
    expect(codes(today, yesterday)).toContain("equipment_recovered_without_repair_note");
  });

  test("a repair note anywhere clears the carryover flag", () => {
    const today = dpr({
      equipment: [{ name: "excavator", status: "used", ...supported }],
      safety_quality: [{ note: "JCB serviced and back in operation", ...supported }],
    });
    expect(codes(today, yesterday)).not.toContain("equipment_recovered_without_repair_note");
  });

  test("without a previous report the cross-day rule simply does not fire", () => {
    const today = dpr({ equipment: [{ name: "excavator", status: "used", ...supported }] });
    expect(codes(today, null)).not.toContain("equipment_recovered_without_repair_note");
  });
});

test("a clean, complete report produces no findings at all", () => {
  const data = dpr({
    weather_site_condition: { value: "clear and dry", ...supported },
    environmental_conditions: [
      { time_label: "07:00", temperature_c: 22, wind_beaufort: 2, rainfall_mm: 0, impact_on_work: false, ...supported },
    ],
    work_items: [{
      description: "column concreting", location: "L2", activity: "concreting",
      quantity: { value: "3", unit: "cum" }, ...supported,
    }],
    labour: [{ trade: "mason", count: 6, ...supported }],
    materials: [{ name: "cement", status: "used", quantity: null, unit: null, ...supported }],
    equipment: [{
      name: "concrete mixer", status: "used", active_hours: 6, idle_hours: 1,
      idle_reason: "lunch break", ...supported,
    }],
  });
  expect(checkConsistency(data)).toEqual([]);
});

test("the enriched fields still validate as dpr.v1 (backward compatible)", () => {
  const data = dpr({
    environmental_conditions: [
      { time_label: "07:00", temperature_c: 21, wind_beaufort: 3, rainfall_mm: 2, impact_on_work: false, ...supported },
    ],
    equipment: [{
      name: "crane", status: "used", active_hours: 5, idle_hours: 2, idle_reason: "no load", ...supported,
    }],
  });
  expect(() => dprSchema.parse(data)).not.toThrow();
  // And a record WITHOUT the new fields still parses — the whole point of keeping them optional.
  const legacy = { ...data };
  delete (legacy as { environmental_conditions?: unknown }).environmental_conditions;
  expect(() => dprSchema.parse(legacy)).not.toThrow();
});
