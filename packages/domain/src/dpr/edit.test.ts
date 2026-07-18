import { expect, test } from "vitest";
import { applyFieldDecision, parseFieldPath } from "./edit";
import type { DprStructuredData } from "./schema";

const base: DprStructuredData = {
  schema_version: "dpr.v1",
  work_items: [{
    description: "Slab casting", location: "Tower A", activity: null,
    quantity: { value: "20", unit: "cum" }, source_refs: [], confidence_band: "Check",
  }],
  labour: [{ trade: "Mason", count: 12, source_refs: [], confidence_band: "Supported" }],
  materials: [], equipment: [], safety_quality: [],
  blockers: [{ description: "Crane down", cause: null, owner: null, expected_resolution: null, source_refs: [], confidence_band: "Check" }],
  weather_site_condition: { value: "Hot", source_refs: [], confidence_band: "Check" },
  tomorrow_plan: [],
};

test("parseFieldPath handles item and scalar paths", () => {
  expect(parseFieldPath("work_items[0].description")).toEqual({ section: "work_items", index: 0 });
  expect(parseFieldPath("weather_site_condition")).toEqual({ section: "weather_site_condition" });
  expect(() => parseFieldPath("nonsense")).toThrow(/unrecognized/i);
});

test("confirm marks Supported without changing values; original object untouched", () => {
  const { data } = applyFieldDecision(base, "work_items[0]", "confirm");
  expect(data.work_items[0].confidence_band).toBe("Supported");
  expect(data.work_items[0].quantity.value).toBe("20");
  expect(base.work_items[0].confidence_band).toBe("Check"); // pure function
});

test("edit replaces fields, validates, and becomes Supported", () => {
  const { data, before, after } = applyFieldDecision(base, "work_items[0]", "edit", {
    quantity: { value: "18", unit: "cum" },
  });
  expect(data.work_items[0].quantity.value).toBe("18");
  expect(data.work_items[0].confidence_band).toBe("Supported");
  expect((before as { quantity: { value: string } }).quantity.value).toBe("20");
  expect((after as { quantity: { value: string } }).quantity.value).toBe("18");
  expect(() => applyFieldDecision(base, "work_items[0]", "edit", { quantity: "twenty" }))
    .toThrow();
});

test("remove deletes the item; mark_unknown nulls values", () => {
  expect(applyFieldDecision(base, "blockers[0]", "remove").data.blockers).toHaveLength(0);
  const { data } = applyFieldDecision(base, "labour[0]", "mark_unknown");
  expect(data.labour[0].count).toBeNull();
  expect(data.labour[0].confidence_band).toBe("Missing");
  const weather = applyFieldDecision(base, "weather_site_condition", "mark_unknown").data;
  expect(weather.weather_site_condition.value).toBeNull();
});

test("out-of-range item fails closed", () => {
  expect(() => applyFieldDecision(base, "work_items[9]", "confirm")).toThrow(/no item/i);
});
