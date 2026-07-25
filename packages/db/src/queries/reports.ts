import { and, eq, desc, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { dailyReports } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import { assertTransition, type ReportStatus } from "@buildflow/domain/report/state";
import type { TenantContext } from "@buildflow/domain/tenancy";

type Report = typeof dailyReports.$inferSelect;

export async function createReport(
  db: AppDb, ctx: TenantContext,
  input: { reportDate: string; note?: string; status?: "UPLOADED" | "SYNCING"; clientReportId?: string },
): Promise<Report> {
  if (!ctx.projectId) throw new Error("projectId required to create a report");
  const id = newId();
  const [row] = await db.insert(dailyReports).values({
    id, organizationId: ctx.organizationId, projectId: ctx.projectId,
    reportDate: input.reportDate, status: input.status ?? "UPLOADED", createdBy: ctx.userId,
    note: input.note ?? null, clientReportId: input.clientReportId ?? null,
  }).returning();
  return row;
}

/** Idempotent-manifest lookup: the mobile device retries with the same clientReportId. */
export async function getReportByClientId(
  db: AppDb, ctx: TenantContext, clientReportId: string,
): Promise<Report | null> {
  const [row] = await db.select().from(dailyReports).where(and(
    eq(dailyReports.organizationId, ctx.organizationId),
    eq(dailyReports.createdBy, ctx.userId),
    eq(dailyReports.clientReportId, clientReportId),
  ));
  return row ?? null;
}

export async function getReport(db: AppDb, ctx: TenantContext, id: string): Promise<Report> {
  const [row] = await db.select().from(dailyReports).where(and(
    eq(dailyReports.id, id), eq(dailyReports.organizationId, ctx.organizationId),
  ));
  if (!row) throw new Error("Report not found");
  return row;
}

export async function listReports(db: AppDb, ctx: TenantContext): Promise<Report[]> {
  return db.select().from(dailyReports)
    .where(eq(dailyReports.organizationId, ctx.organizationId))
    .orderBy(desc(dailyReports.createdAt));
}

export async function setReportStatus(
  db: AppDb, ctx: TenantContext, id: string, to: ReportStatus,
): Promise<void> {
  const current = await getReport(db, ctx, id);
  assertTransition(current.status as ReportStatus, to);
  await db.update(dailyReports)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(dailyReports.id, id), eq(dailyReports.organizationId, ctx.organizationId)));
}

export async function setCurrentRevision(
  db: AppDb, ctx: TenantContext, id: string, revisionId: string,
): Promise<void> {
  await db.update(dailyReports).set({ currentRevisionId: revisionId })
    .where(and(eq(dailyReports.id, id), eq(dailyReports.organizationId, ctx.organizationId)));
}

/**
 * Assigns the next per-project DPR number if this report does not have one yet, and
 * returns it. Mirrors the RFI numbering pattern: max+1 inside the caller's transaction,
 * with the unique index on (project_id, dpr_number) turning a race into a retryable
 * conflict rather than a duplicate serial.
 */
export async function ensureDprNumber(
  db: AppDb, ctx: TenantContext, reportId: string,
): Promise<number> {
  const report = await getReport(db, ctx, reportId);
  if (report.dprNumber != null) return report.dprNumber;
  const rows = (await db.execute(sql`
    select coalesce(max(dpr_number), 0)::int as max from "daily_report"
    where organization_id = ${ctx.organizationId} and project_id = ${report.projectId}
  `) as unknown as { rows: { max: number }[] }).rows;
  const next = (rows[0]?.max ?? 0) + 1;
  await db.update(dailyReports).set({ dprNumber: next }).where(and(
    eq(dailyReports.id, reportId), eq(dailyReports.organizationId, ctx.organizationId),
  ));
  return next;
}
