import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { dailyReports, labourAttendance, mbEntries, reportRevisions } from "@buildflow/db/schema";
import type { TenantContext } from "@buildflow/domain/tenancy";

// Read-only joins for Tier-2 reporting depth (today vs cumulative vs planned, certified
// measurement to date, labour productivity). Nothing here writes: an issued document is
// rendered from stored rows and must be reproducible from them (rules.md §13).

const org = (ctx: TenantContext) => ctx.organizationId;

/**
 * Statuses whose structured data counts as an approved record. SUPERSEDED is included
 * because the work it recorded still happened — a correction issues a new revision, it
 * does not un-happen the day (design.md §17).
 */
export const APPROVED_REPORT_STATUSES = ["APPROVED", "ISSUED", "SUPERSEDED"] as const;

export type ApprovedReportRevision = {
  reportId: string;
  reportDate: string;
  status: string;
  revisionId: string;
  structuredData: unknown;
};

/**
 * Approved reports for one project with their CURRENT revision's structured data, oldest
 * first. `onOrBeforeDate` gives cumulative-to-date; `onDate` gives a single day. A report
 * without a current revision pointer is skipped by the inner join — there is no approved
 * content to count.
 */
export async function listApprovedReportRevisions(
  db: AppDb, ctx: TenantContext, projectId: string,
  opts?: { onOrBeforeDate?: string; onDate?: string },
): Promise<ApprovedReportRevision[]> {
  return db.select({
    reportId: dailyReports.id,
    reportDate: dailyReports.reportDate,
    status: dailyReports.status,
    revisionId: reportRevisions.id,
    structuredData: reportRevisions.structuredData,
  }).from(dailyReports)
    .innerJoin(reportRevisions, and(
      eq(reportRevisions.id, dailyReports.currentRevisionId),
      eq(reportRevisions.organizationId, org(ctx)),
    ))
    .where(and(
      eq(dailyReports.organizationId, org(ctx)),
      eq(dailyReports.projectId, projectId),
      inArray(dailyReports.status, [...APPROVED_REPORT_STATUSES]),
      opts?.onDate ? eq(dailyReports.reportDate, opts.onDate) : undefined,
      opts?.onOrBeforeDate ? lte(dailyReports.reportDate, opts.onOrBeforeDate) : undefined,
    ))
    .orderBy(asc(dailyReports.reportDate), asc(reportRevisions.revisionNumber));
}

export type CertifiedMeasurement = {
  entryId: string;
  mbNumber: number;
  activityId: string | null;
  measurementDate: string;
  quantity: string;
  unit: string;
};

/**
 * Certified Measurement Book entries for one project, oldest measurement first.
 * Superseded entries are excluded: a correction inserts a replacement row and the
 * certified original only ever gains `superseded_by`, so counting both double-counts.
 */
export async function listCertifiedMeasurements(
  db: AppDb, ctx: TenantContext, projectId: string,
  opts?: { onOrBeforeDate?: string },
): Promise<CertifiedMeasurement[]> {
  return db.select({
    entryId: mbEntries.id,
    mbNumber: mbEntries.mbNumber,
    activityId: mbEntries.activityId,
    measurementDate: mbEntries.measurementDate,
    quantity: mbEntries.quantity,
    unit: mbEntries.unit,
  }).from(mbEntries)
    .where(and(
      eq(mbEntries.organizationId, org(ctx)),
      eq(mbEntries.projectId, projectId),
      eq(mbEntries.status, "certified"),
      isNull(mbEntries.supersededBy),
      opts?.onOrBeforeDate ? lte(mbEntries.measurementDate, opts.onOrBeforeDate) : undefined,
    ))
    .orderBy(asc(mbEntries.measurementDate), asc(mbEntries.mbNumber));
}

/** Attendance rows for exactly one date — daily totals only, no worker identities. */
export async function listAttendanceOnDate(
  db: AppDb, ctx: TenantContext, projectId: string, attendanceDate: string,
): Promise<(typeof labourAttendance.$inferSelect)[]> {
  return db.select().from(labourAttendance)
    .where(and(
      eq(labourAttendance.organizationId, org(ctx)),
      eq(labourAttendance.projectId, projectId),
      eq(labourAttendance.attendanceDate, attendanceDate),
    ))
    .orderBy(asc(labourAttendance.trade), desc(labourAttendance.createdAt));
}
