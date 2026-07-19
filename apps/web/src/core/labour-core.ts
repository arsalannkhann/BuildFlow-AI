import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { addDecimal, isDecimalString, normalizeDecimal } from "@buildflow/domain/decimal";
import { dprSchema } from "@buildflow/domain/dpr/schema";
import {
  addAttendance, addContractor, getContractor, listAttendance, listContractors,
} from "@buildflow/db/queries/labour";
import { listActivities } from "@buildflow/db/queries/reference";
import { listReports } from "@buildflow/db/queries/reports";
import { getRevision } from "@buildflow/db/queries/revisions";
import { audit } from "@buildflow/db/queries/audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function registerContractor(db: AppDb, ctx: TenantContext, input: {
  name: string; trade?: string | null; projectId?: string | null;
}): Promise<string> {
  assertCan(ctx, "labour.manage");
  if (!input.name?.trim()) throw new Error("Name is required");
  const row = await addContractor(db, ctx, { ...input, name: input.name.trim() });
  await audit(db, ctx, { action: "labour.contractor_registered", subjectRef: row.id, metadata: {} });
  return row.id;
}

// Daily totals only: trade + headcount (+ optional hours), never individual identities
// and never biometrics (PRD non-goals).
export async function recordAttendance(db: AppDb, ctx: TenantContext, input: {
  projectId: string; attendanceDate: string; trade: string; headcount: number;
  contractorId?: string | null; hoursWorked?: string | null;
  locationId?: string | null; activityId?: string | null; note?: string | null;
}): Promise<string> {
  assertCan(ctx, "labour.manage");
  if (!DATE_RE.test(input.attendanceDate)) throw new Error("Attendance date must be YYYY-MM-DD");
  if (!input.trade?.trim()) throw new Error("Trade is required");
  if (!Number.isInteger(input.headcount) || input.headcount <= 0) {
    throw new Error("Headcount must be a positive whole number");
  }
  if (input.hoursWorked && !isDecimalString(input.hoursWorked)) throw new Error("Hours must be a decimal number");
  if (input.contractorId) {
    if (!(await getContractor(db, ctx, input.contractorId))) throw new Error("Contractor not found");
  }
  const row = await addAttendance(db, ctx, {
    ...input, trade: input.trade.trim(),
    hoursWorked: input.hoursWorked ? normalizeDecimal(input.hoursWorked) : null,
  });
  await audit(db, ctx, {
    action: "labour.attendance_recorded", subjectRef: row.id,
    metadata: { date: input.attendanceDate, trade: row.trade, headcount: row.headcount },
  });
  return row.id;
}

export type AttendanceDay = {
  date: string;
  totalHeadcount: number;
  totalHours: string | null;
  byTrade: { trade: string; headcount: number }[];
};

/** Daily totals grouped from attendance rows — plain sums, nothing inferred. */
export async function attendanceSummary(
  db: AppDb, ctx: TenantContext, projectId: string, fromDate?: string,
): Promise<AttendanceDay[]> {
  assertCan(ctx, "project.read");
  const rows = await listAttendance(db, ctx, projectId, { fromDate });
  const days = new Map<string, { headcount: number; hours: string | null; byTrade: Map<string, number> }>();
  for (const row of rows) {
    const day = days.get(row.attendanceDate) ?? { headcount: 0, hours: null, byTrade: new Map() };
    day.headcount += row.headcount;
    if (row.hoursWorked) day.hours = addDecimal(day.hours ?? "0", row.hoursWorked);
    day.byTrade.set(row.trade, (day.byTrade.get(row.trade) ?? 0) + row.headcount);
    days.set(row.attendanceDate, day);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, d]) => ({
      date, totalHeadcount: d.headcount, totalHours: d.hours,
      byTrade: [...d.byTrade.entries()].map(([trade, headcount]) => ({ trade, headcount })),
    }));
}

export type ProductivityRow = {
  date: string;
  activity: string;
  headcount: number;
  hoursWorked: string | null;
  approvedQuantities: { description: string; value: string; unit: string | null; reportId: string }[];
};

// Deterministic join of attendance totals against APPROVED DPR work-item quantities per
// activity/day. Rows without an approved counterpart still appear (empty quantities).
// This is a join, not a score — no productivity rating is computed (rules.md §11).
export async function labourProductivity(
  db: AppDb, ctx: TenantContext, projectId: string, fromDate?: string,
): Promise<ProductivityRow[]> {
  assertCan(ctx, "project.read");
  const [attendance, activities, reports] = await Promise.all([
    listAttendance(db, ctx, projectId, { fromDate }),
    listActivities(db, ctx, projectId),
    listReports(db, ctx),
  ]);
  const activityName = new Map(activities.map((a) => [a.id, a.name]));
  const approved = reports.filter((r) =>
    r.projectId === projectId && ["APPROVED", "ISSUED"].includes(r.status) && r.currentRevisionId &&
    (!fromDate || r.reportDate >= fromDate));

  // (date, activity lowercased) -> approved work-item quantities
  const quantities = new Map<string, ProductivityRow["approvedQuantities"]>();
  for (const report of approved) {
    const revision = await getRevision(db, ctx, report.currentRevisionId as string);
    const parsed = dprSchema.safeParse(revision.structuredData);
    if (!parsed.success) continue; // older schema revisions never break the join
    for (const item of parsed.data.work_items) {
      if (!item.activity || item.quantity.value == null) continue;
      const key = `${report.reportDate}|${item.activity.toLowerCase()}`;
      const list = quantities.get(key) ?? [];
      list.push({
        description: item.description, value: item.quantity.value,
        unit: item.quantity.unit, reportId: report.id,
      });
      quantities.set(key, list);
    }
  }

  const byKey = new Map<string, ProductivityRow>();
  for (const row of attendance) {
    if (!row.activityId) continue;
    const name = activityName.get(row.activityId);
    if (!name) continue;
    const key = `${row.attendanceDate}|${name.toLowerCase()}`;
    const existing = byKey.get(key) ?? {
      date: row.attendanceDate, activity: name, headcount: 0, hoursWorked: null,
      approvedQuantities: quantities.get(key) ?? [],
    };
    existing.headcount += row.headcount;
    if (row.hoursWorked) existing.hoursWorked = addDecimal(existing.hoursWorked ?? "0", row.hoursWorked);
    byKey.set(key, existing);
  }
  return [...byKey.values()].sort((a, b) =>
    b.date.localeCompare(a.date) || a.activity.localeCompare(b.activity));
}
