import type { DprStructuredData } from "./schema";
import type { ValidationIssue } from "./validate";
import { resolveAlias } from "../resolve";

/**
 * Contractual consistency checks (blueprint §8.2 — Tier 2 logical consistency).
 *
 * These are the checks a commercial manager would run by eye before certifying a Running
 * Account bill, made deterministic: does the report contradict itself, does it omit the
 * evidence a claim needs, does it disagree with yesterday. They exist because a report can be
 * schema-perfect and still be commercially wrong — "100 m³ of concrete poured" with no cement
 * anywhere in the materials is either revenue leakage or an invented claim, and both are
 * invisible to a field-by-field validator.
 *
 * What they are NOT: they never edit the report and never reject it. Every finding is routed
 * to the reviewer (Tier 3, human-in-the-loop) exactly like the recording-quality signals —
 * a construction record is the engineer's account, and a machine flags it for a human, it
 * does not overrule it (rules.md §11). A finding is a question, not a verdict.
 *
 * Pure and dependency-free apart from the seeded site vocabulary, so the same report always
 * produces the same findings and every rule is unit-testable in isolation.
 */

export type ConsistencySeverity = "info" | "warning";

export type ConsistencyFinding = ValidationIssue & { severity: ConsistencySeverity };

/** Activities that CONSUME a binder. A pour without cement/ready-mix is the classic tell. */
const POUR_ACTIVITIES = new Set(["concreting", "pcc", "rcc"]);
/** Materials that satisfy "there was something to pour with". */
const BINDING_MATERIALS = new Set(["cement", "ready mix concrete"]);
/** Words that explain away a machine that was down yesterday and is running today. */
const REPAIR_MARKERS = [
  "repair", "repaired", "fixed", "serviced", "service", "maintenance", "back in",
  "theek", "thik", "sahi", "maramat", "मरम्मत", "ठीक", "सही",
];

const activityCanonical = (phrase: string | null | undefined): string | null =>
  phrase ? (resolveAlias(phrase, "activity")?.canonicalValue ?? null) : null;

const isPour = (activity: string | null, description: string): boolean =>
  POUR_ACTIVITIES.has(activityCanonical(activity) ?? "")
  || POUR_ACTIVITIES.has(activityCanonical(description) ?? "");

const materialCanonical = (name: string): string | null =>
  resolveAlias(name, "material")?.canonicalValue ?? null;

const equipmentCanonical = (name: string): string =>
  resolveAlias(name, "equipment")?.canonicalValue ?? name.trim().toLowerCase();

const mentionsAny = (text: string, markers: string[]): boolean => {
  const hay = text.normalize("NFC").toLowerCase();
  return markers.some((marker) => hay.includes(marker.normalize("NFC").toLowerCase()));
};

/**
 * Runs every consistency rule over a report. `previous` is the prior day's report for the
 * same project when available — the cross-day rules simply do not fire without it, they never
 * error.
 */
export function checkConsistency(
  data: DprStructuredData,
  context?: { previous?: DprStructuredData | null },
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];

  // R1 — concrete work with no binder recorded. High-value: this is where an over-claimed
  // pour or a missing Goods-Received entry surfaces.
  const pours = data.work_items.filter((item) => isPour(item.activity, item.description));
  if (pours.length > 0) {
    const hasBinder = data.materials.some((m) => BINDING_MATERIALS.has(materialCanonical(m.name) ?? ""));
    if (!hasBinder) {
      findings.push({
        code: "concrete_without_binder", severity: "warning", path: "materials",
        message: "Concrete work is reported but no cement or ready-mix concrete appears in the "
          + "materials list. Confirm the pour and that the material was recorded (it feeds the "
          + "Goods Received Note and the RA bill).",
      });
    }
  }

  data.equipment.forEach((row, index) => {
    const active = row.active_hours ?? null;
    const idle = row.idle_hours ?? null;

    // R2 — idle plant with no reason. Standing time is only recoverable if the cause is on
    // record; an idle machine with a blank reason is money the claim cannot ask for.
    if (idle !== null && idle > 0 && !(row.idle_reason ?? "").trim()) {
      findings.push({
        code: "idle_plant_without_reason", severity: "warning", path: `equipment[${index}]`,
        message: `${row.name} is recorded as idle with no reason. Standing-time cost is only `
          + "recoverable when the cause is documented — add why it stood.",
      });
    }

    // R3 — a machine cannot log more than a day. Catches a units slip (minutes as hours) or a
    // double-count before it lands in a productivity report.
    if (active !== null && idle !== null && active + idle > 24) {
      findings.push({
        code: "plant_hours_exceed_day", severity: "warning", path: `equipment[${index}]`,
        message: `${row.name} logs ${active + idle} hours in one day (active ${active} + idle `
          + `${idle}). A day is 24 hours — check the figures.`,
      });
    }
  });

  // R4 — adverse weather claimed, but no measurement to price it. NEC4 Clause 60.1(13) needs
  // the readings, not the adjective; "bad weather today" cannot support a compensation event.
  const intervals = data.environmental_conditions ?? [];
  const claimsWeatherImpact =
    intervals.some((c) => c.impact_on_work === true)
    || mentionsAny(data.weather_site_condition.value ?? "", [
      "rain", "storm", "heavy", "flood", "adverse", "washed", "barish", "toofan", "बारिश", "तूफान",
    ]);
  const hasMeasuredInterval = intervals.some(
    (c) => c.temperature_c !== null || c.rainfall_mm !== null || c.wind_beaufort !== null);
  if (claimsWeatherImpact && !hasMeasuredInterval) {
    findings.push({
      code: "adverse_weather_without_measurement", severity: "warning", path: "environmental_conditions",
      message: "Adverse weather is noted but there are no measured readings (temperature, "
        + "rainfall, wind) at fixed times. Without them a weather compensation event cannot be "
        + "priced — record the conditions at 07:00, 12:00 and 17:00.",
    });
  }

  // R7 — work executed with no labour and no plant recorded at all. A completeness nudge:
  // physical progress without a single worker or machine on the report is almost always an
  // omission, not reality.
  if (data.work_items.length > 0 && data.labour.length === 0 && data.equipment.length === 0) {
    findings.push({
      code: "work_without_resources", severity: "info", path: "labour",
      message: "Work is reported but no labour or plant is recorded for the day. Confirm the "
        + "crew and equipment were captured — they value the work and any compensation event.",
    });
  }

  // R6 — a machine reported unavailable yesterday is running today with no repair on record.
  const previous = context?.previous ?? null;
  if (previous) {
    const downYesterday = new Set(
      previous.equipment
        .filter((row) => row.status === "unavailable")
        .map((row) => equipmentCanonical(row.name)));
    if (downYesterday.size > 0) {
      const repairMentioned =
        data.safety_quality.some((row) => mentionsAny(row.note, REPAIR_MARKERS))
        || data.equipment.some((row) => mentionsAny(row.idle_reason ?? "", REPAIR_MARKERS))
        || data.blockers.some((row) =>
          mentionsAny([row.description, row.cause ?? ""].join(" "), REPAIR_MARKERS));
      data.equipment.forEach((row, index) => {
        if (row.status === "unavailable") return;
        if (!downYesterday.has(equipmentCanonical(row.name))) return;
        if (repairMentioned) return;
        findings.push({
          code: "equipment_recovered_without_repair_note", severity: "warning",
          path: `equipment[${index}]`,
          message: `${row.name} was reported unavailable yesterday and is in use today with no `
            + "repair or return noted. Confirm it is genuinely back — the gap matters for any "
            + "standing-time claim.",
        });
      });
    }
  }

  return findings;
}
