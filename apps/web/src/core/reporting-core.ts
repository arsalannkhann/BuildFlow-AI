import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { addDecimal, isDecimalString, normalizeDecimal } from "@buildflow/domain/decimal";
import { dprSchema, type DprStructuredData } from "@buildflow/domain/dpr/schema";
import { getReport } from "@buildflow/db/queries/reports";
import {
  listBlockers, listProgressUpdates, listReportLinks, listScheduleItems,
} from "@buildflow/db/queries/controls";
import { listActivities } from "@buildflow/db/queries/reference";
import {
  listApprovedReportRevisions, listAttendanceOnDate, listCertifiedMeasurements,
} from "@buildflow/db/queries/reporting";
// The issued document owns these shapes: this core exists to fill them and nothing else
// consumes them. Type-only import of the template module (no Playwright, no runtime cost).
import type {
  ActivityProgressRow, ProductivityBlock, ProductivityUnitRow, ReportFigure, TrackedBlockerRow,
} from "@buildflow/pdf/template";

/**
 * Tier-2 reporting depth for ONE report, computed only from stored rows.
 *
 * Every figure is a sum of records that exist, and every figure carries the basis it was
 * derived from. Nothing here interpolates, extrapolates or estimates: an unknown value is
 * `null` and the document prints an em dash (rules.md §11 — deterministic calculations are
 * separated from model output, and a percentage is never invented).
 *
 * Three quantities are deliberately kept apart rather than merged:
 *   - what the DPR *stated* (today, and cumulative across approved reports), and
 *   - what was *measured and certified* in the Measurement Book.
 * Adding them would double-count the same physical work.
 */
export type ReportingDepth = {
  reportDate: string;
  activityProgress: ActivityProgressRow[];
  trackedBlockers: TrackedBlockerRow[];
  productivity: ProductivityBlock;
};

const DAY_MS = 86_400_000;

/** Whole days between two ISO dates. Both sides are date-only, so DST never shifts this. */
const dayDiff = (fromIso: string, toIso: string): number =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);

/** Stored timestamps are compared as UTC date parts, matching how report dates are stored. */
const dateOf = (at: Date): string => at.toISOString().slice(0, 10);

const unknown = (basis: string): ReportFigure => ({ value: null, unit: null, basis });

type QuantityPart = { value: string | null; unit: string | null };

/**
 * Sums quantities that share a unit. Values that are absent or not a decimal number are
 * skipped and counted, because a total that silently drops rows would misrepresent the day.
 * Different units are never coerced into one another — the sum is refused instead.
 */
function sumParts(parts: QuantityPart[]): {
  total: string | null; unit: string | null; counted: number; unusable: number; units: string[];
} {
  const usable = parts.filter((p) => p.value !== null && isDecimalString(p.value));
  const unusable = parts.length - usable.length;
  const units = [...new Set(usable.map((p) => (p.unit ?? "").trim()))];
  if (usable.length === 0) return { total: null, unit: null, counted: 0, unusable, units: [] };
  if (units.length > 1) {
    return { total: null, unit: null, counted: usable.length, unusable, units };
  }
  const total = usable.reduce(
    (acc, p) => addDecimal(acc, normalizeDecimal(p.value as string)), "0",
  );
  return { total, unit: units[0] || null, counted: usable.length, unusable, units };
}

/** Turns a sum into a document figure, stating what it was summed from. */
function figureFrom(
  sum: ReturnType<typeof sumParts>, label: string, sourceCount: number,
): ReportFigure {
  if (sourceCount === 0) return unknown(`${label}: no attributed record.`);
  if (sum.units.length > 1) {
    return unknown(`${label}: not summed — ${sum.counted} records use different units (${sum.units.map((u) => u || "no unit").join(", ")}).`);
  }
  if (sum.total === null) {
    return unknown(`${label}: ${sourceCount} attributed record(s), none carrying a numeric quantity.`);
  }
  const caveat = sum.unusable > 0
    ? ` ${sum.unusable} attributed record(s) carried no numeric quantity and are excluded.`
    : "";
  return {
    value: sum.total, unit: sum.unit,
    basis: `${label}: sum of ${sum.counted} record(s).${caveat}`,
  };
}

const sameText = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Which work items of a report count towards a schedule activity.
 *
 * 1. A link row that names a work item index attributes exactly that item.
 * 2. A link row without an index attributes the items whose `activity` text matches the
 *    schedule item's activity name.
 * Indices are de-duplicated, so overlapping link rows cannot double-count an item.
 */
function attributedIndices(
  data: DprStructuredData,
  links: { workItemIndex: number | null }[],
  activityName: string | null,
): number[] {
  const picked = new Set<number>();
  for (const link of links) {
    if (link.workItemIndex !== null) {
      if (link.workItemIndex >= 0 && link.workItemIndex < data.work_items.length) {
        picked.add(link.workItemIndex);
      }
      continue;
    }
    data.work_items.forEach((item, index) => {
      if (sameText(item.activity, activityName)) picked.add(index);
    });
  }
  return [...picked].sort((a, b) => a - b);
}

const parseRevision = (raw: unknown): DprStructuredData | null => {
  const parsed = dprSchema.safeParse(raw);
  return parsed.success ? parsed.data : null; // older schema revisions never break a sum
};

export async function reportingDepth(
  db: AppDb, ctx: TenantContext, reportId: string,
): Promise<ReportingDepth> {
  assertCan(ctx, "report.read");
  const report = await getReport(db, ctx, reportId);
  const projectId = report.projectId;
  const asAt = report.reportDate;

  const [links, scheduleItems, activities, approved, certified, blockers, attendance] =
    await Promise.all([
      listReportLinks(db, ctx, { reportId }),
      listScheduleItems(db, ctx, projectId),
      listActivities(db, ctx, projectId),
      listApprovedReportRevisions(db, ctx, projectId, { onOrBeforeDate: asAt }),
      listCertifiedMeasurements(db, ctx, projectId, { onOrBeforeDate: asAt }),
      listBlockers(db, ctx, projectId),
      listAttendanceOnDate(db, ctx, projectId, asAt),
    ]);

  const activityName = new Map(activities.map((a) => [a.id, a.name]));
  const activityUnit = new Map(activities.map((a) => [a.id, a.unit]));
  const revisionByReport = new Map<string, DprStructuredData>();
  for (const row of approved) {
    const parsed = parseRevision(row.structuredData);
    if (parsed) revisionByReport.set(row.reportId, parsed);
  }
  const approvedDateOf = new Map(approved.map((r) => [r.reportId, r.reportDate]));

  // --- T2.1: today vs cumulative vs planned, per linked schedule activity ---

  const activityProgress: ActivityProgressRow[] = [];
  const linkedItemIds = [...new Set(links.map((l) => l.scheduleItemId))];
  for (const scheduleItemId of linkedItemIds) {
    const item = scheduleItems.find((s) => s.id === scheduleItemId);
    if (!item) continue; // link to an item outside this project's schedule: nothing to show
    const name = item.activityId ? activityName.get(item.activityId) ?? null : null;
    const unit = item.activityId ? activityUnit.get(item.activityId) ?? null : null;

    const todayLinks = links.filter((l) => l.scheduleItemId === scheduleItemId);
    const todayData = revisionByReport.get(reportId);
    const todayIndices = todayData ? attributedIndices(todayData, todayLinks, name) : [];
    const todayParts = todayData
      ? todayIndices.map((i) => todayData.work_items[i].quantity)
      : [];
    const today = figureFrom(
      sumParts(todayParts),
      `Today, from this report's work item(s) ${todayIndices.map((i) => `#${i + 1}`).join(", ") || "—"}`,
      todayParts.length,
    );

    // Cumulative walks every approved report for the project up to and including this
    // report date, attributing work items through that report's own link rows.
    const itemLinks = await listReportLinks(db, ctx, { scheduleItemId });
    const cumulativeParts: QuantityPart[] = [];
    const countedReports = new Set<string>();
    for (const linkedReportId of new Set(itemLinks.map((l) => l.reportId))) {
      const data = revisionByReport.get(linkedReportId);
      if (!data) continue; // not approved, dated after this report, or an older schema
      const rows = itemLinks.filter((l) => l.reportId === linkedReportId);
      const indices = attributedIndices(data, rows, name);
      if (indices.length === 0) continue;
      countedReports.add(linkedReportId);
      for (const i of indices) cumulativeParts.push(data.work_items[i].quantity);
    }
    const cumulative = figureFrom(
      sumParts(cumulativeParts),
      `Cumulative to ${asAt}, from ${countedReports.size} approved report(s)`,
      cumulativeParts.length,
    );

    const certifiedRows = item.activityId
      ? certified.filter((c) => c.activityId === item.activityId)
      : [];
    const certifiedFigure = !item.activityId
      ? unknown("Certified measurement: this schedule item names no project activity, so Measurement Book entries cannot be attributed to it.")
      : figureFrom(
        sumParts(certifiedRows.map((c) => ({ value: c.quantity, unit: c.unit }))),
        `Certified to ${asAt}, from MB entr${certifiedRows.length === 1 ? "y" : "ies"} ${certifiedRows.map((c) => `#${c.mbNumber}`).join(", ") || "—"}`,
        certifiedRows.length,
      );

    // Planned quantity: no stored column carries one anywhere in the schema, so it is
    // reported as unknown. Inventing it from a percentage or a baseline duration is
    // exactly what rules.md §11 forbids. The baseline DATES are stored, and are shown.
    const planned: ReportFigure = {
      value: null, unit,
      basis: "Planned quantity: no planned or baseline quantity is stored for this activity — only baseline dates are recorded.",
    };

    const updates = await listProgressUpdates(db, ctx, scheduleItemId);
    const latest = updates[0]; // listProgressUpdates orders newest first
    const progressPercent = latest ? item.progressPercent : null;
    const progressBasis = latest
      ? `Progress ${item.progressPercent}%: manually recorded ${dateOf(latest.createdAt)}${
        latest.percent !== item.progressPercent ? ` (latest update recorded ${latest.percent}%)` : ""
      }${latest.reportId ? `, citing approved report ${approvedDateOf.get(latest.reportId) ?? latest.reportId}` : ", with no cited report"}.`
      : "Progress: no progress update has been recorded, so no percentage is shown.";

    activityProgress.push({
      scheduleItemId,
      name: item.name,
      activityName: name,
      baselineWindow: item.baselineStart && item.baselineEnd
        ? `${item.baselineStart} → ${item.baselineEnd}`
        : null,
      planned, today, cumulative, certified: certifiedFigure,
      progressPercent, progressBasis,
    });
  }
  activityProgress.sort((a, b) => a.name.localeCompare(b.name));

  // --- T2.2: first-class tracked blockers open on this project ---

  // Reference date is the report date, not "now", so re-rendering a historical document
  // reproduces the same ages (rules.md §13).
  const trackedBlockers: TrackedBlockerRow[] = blockers
    .filter((b) => b.status !== "resolved" && dateOf(b.createdAt) <= asAt)
    .map((b) => ({
      id: b.id,
      title: b.title,
      severity: b.severity,
      status: b.status,
      owner: b.ownerName,
      dueDate: b.dueDate,
      ageDays: dayDiff(dateOf(b.createdAt), asAt),
      overdue: b.dueDate !== null && b.dueDate < asAt,
    }))
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));

  // --- T2.4: labour productivity for the report date ---

  const headcount = attendance.reduce((sum, row) => sum + row.headcount, 0);
  const byTrade = new Map<string, number>();
  for (const row of attendance) {
    byTrade.set(row.trade, (byTrade.get(row.trade) ?? 0) + row.headcount);
  }
  const sameDayApproved = approved.filter((r) => r.reportDate === asAt);
  const sameDayParts: QuantityPart[] = [];
  for (const row of sameDayApproved) {
    const data = revisionByReport.get(row.reportId);
    if (!data) continue;
    for (const workItem of data.work_items) sameDayParts.push(workItem.quantity);
  }
  const productivity = buildProductivity({
    date: asAt,
    headcount: attendance.length === 0 ? null : headcount,
    headcountBasis: attendance.length === 0
      ? null
      : `${attendance.length} attendance record(s): ${[...byTrade.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([trade, count]) => `${trade} ${count}`).join(", ")}`,
    approvedReportCount: sameDayApproved.length,
    parts: sameDayParts,
  });

  return { reportDate: asAt, activityProgress, trackedBlockers, productivity };
}

const PER_HEAD_DP = 3;

/**
 * Exact decimal ÷ whole headcount, rounded half-up to 3 decimal places. Quantities are
 * decimal strings, never binary floating point (rules.md §7); the caller prints the
 * formula so a reader can check the arithmetic, and inexact results are marked "≈".
 */
export function quantityPerHead(total: string, headcount: number): { value: string; exact: boolean } {
  if (!isDecimalString(total)) throw new Error(`Not a decimal quantity: "${total}"`);
  if (!Number.isInteger(headcount) || headcount <= 0) {
    throw new Error("Headcount must be a positive whole number");
  }
  const normalized = normalizeDecimal(total);
  const negative = normalized.startsWith("-");
  const [whole, frac = ""] = (negative ? normalized.slice(1) : normalized).split(".");
  const scaled = BigInt(whole + frac);
  const numerator = scaled * 10n ** BigInt(PER_HEAD_DP);
  const denominator = 10n ** BigInt(frac.length) * BigInt(headcount);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  const digits = rounded.toString().padStart(PER_HEAD_DP + 1, "0");
  const decimals = digits.slice(digits.length - PER_HEAD_DP).replace(/0+$/, "");
  const value = `${negative && rounded > 0n ? "-" : ""}${digits.slice(0, digits.length - PER_HEAD_DP)}${decimals ? `.${decimals}` : ""}`;
  return { value, exact: remainder === 0n };
}

/**
 * Quantity-per-head, or an explicit statement that it cannot be calculated. When either
 * side of the join is missing the document says so — a ratio built on a missing half
 * would read as a measured fact.
 */
export function buildProductivity(input: {
  date: string;
  headcount: number | null;
  headcountBasis: string | null;
  approvedReportCount: number;
  parts: QuantityPart[];
}): ProductivityBlock {
  const base = {
    date: input.date, headcount: input.headcount, headcountBasis: input.headcountBasis,
  };
  const byUnit = new Map<string, QuantityPart[]>();
  for (const part of input.parts) {
    if (part.value === null || !isDecimalString(part.value)) continue;
    const key = (part.unit ?? "").trim();
    byUnit.set(key, [...(byUnit.get(key) ?? []), part]);
  }

  const missing: string[] = [];
  if (input.headcount === null || input.headcount <= 0) {
    missing.push(`no labour attendance is recorded for ${input.date}`);
  }
  if (byUnit.size === 0) {
    missing.push(input.approvedReportCount === 0
      ? `no approved report exists for ${input.date}`
      : `no approved work item for ${input.date} carries a numeric quantity`);
  }
  if (missing.length > 0) {
    return {
      ...base, rows: [],
      unavailableReason: `Quantity per head is not shown: ${missing.join(", and ")}.`,
    };
  }

  const headcount = input.headcount as number;
  const workers = `${headcount} ${headcount === 1 ? "worker" : "workers"}`;
  const rows: ProductivityUnitRow[] = [...byUnit.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([unit, parts]) => {
      const quantity = parts.reduce(
        (acc, p) => addDecimal(acc, normalizeDecimal(p.value as string)), "0",
      );
      const { value, exact } = quantityPerHead(quantity, headcount);
      const suffix = unit ? ` ${unit}` : "";
      return {
        unit: unit || null,
        quantity,
        perHead: value,
        formula: `${quantity}${suffix} ÷ ${workers} ${exact ? "=" : "≈"} ${value}${suffix} per head`,
      };
    });
  return { ...base, rows, unavailableReason: null };
}
