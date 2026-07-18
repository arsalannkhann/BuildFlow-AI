import { z } from "zod";
import { dprSchema, type DprStructuredData } from "./schema";

// Review-time field decisions (design.md §8): every decision is applied as a pure
// transformation producing the next revision's structured data. The caller records the
// decision + before/after in the append-only review trail.

export const FIELD_DECISIONS = ["confirm", "edit", "remove", "mark_unknown"] as const;
export type FieldDecision = (typeof FIELD_DECISIONS)[number];

const ARRAY_SECTIONS = [
  "work_items", "labour", "materials", "equipment", "safety_quality", "blockers", "tomorrow_plan",
] as const;
type ArraySection = (typeof ARRAY_SECTIONS)[number];

export type FieldTarget =
  | { section: ArraySection; index: number }
  | { section: "weather_site_condition" };

/** Parses "work_items[2]", "work_items[2].description", or "weather_site_condition". */
export function parseFieldPath(path: string): FieldTarget {
  if (path === "weather_site_condition" || path.startsWith("weather_site_condition.")) {
    return { section: "weather_site_condition" };
  }
  const match = /^([a-z_]+)\[(\d+)\]/.exec(path);
  if (!match) throw new Error(`Unrecognized field path: ${path}`);
  const [, section, index] = match;
  if (!(ARRAY_SECTIONS as readonly string[]).includes(section)) {
    throw new Error(`Unknown section: ${section}`);
  }
  return { section: section as ArraySection, index: Number(index) };
}

type ArrayItem = DprStructuredData[ArraySection][number];

const clone = (data: DprStructuredData): DprStructuredData =>
  JSON.parse(JSON.stringify(data)) as DprStructuredData;

export function applyFieldDecision(
  data: DprStructuredData,
  path: string,
  decision: FieldDecision,
  newValue?: unknown,
): { data: DprStructuredData; before: unknown; after: unknown } {
  const target = parseFieldPath(path);
  const next = clone(data);

  if (target.section === "weather_site_condition") {
    const before = data.weather_site_condition;
    if (decision === "remove" || decision === "mark_unknown") {
      next.weather_site_condition = { value: null, source_refs: [], confidence_band: "Missing" };
    } else if (decision === "confirm") {
      next.weather_site_condition = { ...before, confidence_band: "Supported" };
    } else {
      const value = z.string().min(1).parse(newValue);
      next.weather_site_condition = { ...before, value, confidence_band: "Supported" };
    }
    // Re-validate the whole document so no decision can corrupt the record.
    return { data: dprSchema.parse(next), before, after: next.weather_site_condition };
  }

  const list = next[target.section] as ArrayItem[];
  const before = (data[target.section] as ArrayItem[])[target.index];
  if (before === undefined) throw new Error(`No item at ${path}`);

  let after: unknown = null;
  if (decision === "remove") {
    list.splice(target.index, 1);
  } else if (decision === "confirm") {
    const item = { ...list[target.index], confidence_band: "Supported" as const };
    list[target.index] = item;
    after = item;
  } else if (decision === "mark_unknown") {
    const item = { ...list[target.index], confidence_band: "Missing" as const } as ArrayItem;
    if ("quantity" in item && item.quantity) item.quantity = { value: null, unit: null };
    if ("count" in item) (item as { count: number | null }).count = null;
    list[target.index] = item;
    after = item;
  } else {
    // edit: newValue must be a full valid item for this section; the reviewer's edit
    // is human-verified, so the band becomes Supported while source_refs are preserved
    // unless the editor supplies their own.
    const itemSchema = dprSchema.shape[target.section].element;
    const merged = { ...list[target.index], ...(newValue as object) };
    const item = itemSchema.parse({ ...merged, confidence_band: "Supported" }) as ArrayItem;
    list[target.index] = item;
    after = item;
  }
  return { data: dprSchema.parse(next), before, after };
}
