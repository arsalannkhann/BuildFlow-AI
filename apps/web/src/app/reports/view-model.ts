import type { DprStructuredData, ConfidenceBand, SourceRef } from "@buildflow/domain/dpr/schema";

export type FieldRow = {
  section: string; path: string; label: string; value: string;
  band: ConfidenceBand; refs: SourceRef[];
};

export function buildFieldRows(d: DprStructuredData): FieldRow[] {
  const rows: FieldRow[] = [];
  d.work_items.forEach((w, i) => rows.push({
    section: "Work items", path: `work_items[${i}].description`, label: w.description,
    value: [w.quantity.value && `${w.quantity.value} ${w.quantity.unit ?? ""}`.trim(), w.location].filter(Boolean).join(" · ") || "—",
    band: w.confidence_band, refs: w.source_refs }));
  d.labour.forEach((l, i) => rows.push({ section: "Labour", path: `labour[${i}]`,
    label: l.trade, value: l.count === null ? "count unknown" : String(l.count), band: l.confidence_band, refs: l.source_refs }));
  d.materials.forEach((m, i) => rows.push({ section: "Materials", path: `materials[${i}]`,
    label: m.name, value: m.status ?? "—", band: m.confidence_band, refs: m.source_refs }));
  d.blockers.forEach((b, i) => rows.push({ section: "Blockers", path: `blockers[${i}]`,
    label: b.description, value: b.owner ?? "no owner", band: b.confidence_band, refs: b.source_refs }));
  rows.push({ section: "Weather", path: "weather_site_condition", label: "Site condition",
    value: d.weather_site_condition.value ?? "Not mentioned", band: d.weather_site_condition.confidence_band, refs: d.weather_site_condition.source_refs });
  d.tomorrow_plan.forEach((t, i) => rows.push({ section: "Tomorrow", path: `tomorrow_plan[${i}]`,
    label: t.item, value: "—", band: t.confidence_band, refs: t.source_refs }));
  return rows;
}

export function unresolvedCount(rows: FieldRow[]): number {
  return rows.filter((r) => r.band !== "Supported").length;
}
