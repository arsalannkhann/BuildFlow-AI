import { and, eq, desc } from "drizzle-orm";
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
