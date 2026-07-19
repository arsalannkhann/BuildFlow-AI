import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { auditEvents, dailyReports, jobs, processingRuns } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type OperationalJob = {
  id: string; kind: string; status: string; attempts: number; maxAttempts: number;
  runAfter: Date; leasedUntil: Date | null; updatedAt: Date;
};

export async function listOperationalJobs(
  db: AppDb, ctx: TenantContext, limit = 50,
): Promise<OperationalJob[]> {
  return db.select({
    id: jobs.id, kind: jobs.kind, status: jobs.status, attempts: jobs.attempts,
    maxAttempts: jobs.maxAttempts, runAfter: jobs.runAfter, leasedUntil: jobs.leasedUntil,
    updatedAt: jobs.updatedAt,
  }).from(jobs).where(and(
    eq(jobs.organizationId, ctx.organizationId),
    sql`${jobs.status} in ('queued', 'leased', 'failed', 'dead')`,
  )).orderBy(desc(jobs.updatedAt)).limit(Math.min(limit, 200));
}

export async function listStuckProcessing(
  db: AppDb, ctx: TenantContext, olderThanMinutes = 15,
) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  return db.select({
    id: dailyReports.id, projectId: dailyReports.projectId,
    updatedAt: dailyReports.updatedAt, reportDate: dailyReports.reportDate,
  }).from(dailyReports).where(and(
    eq(dailyReports.organizationId, ctx.organizationId),
    eq(dailyReports.status, "PROCESSING"), lt(dailyReports.updatedAt, cutoff),
  )).orderBy(asc(dailyReports.updatedAt));
}

export async function providerRunHealth(db: AppDb, ctx: TenantContext) {
  const result = await db.execute(sql`
    select provider, model,
      count(*)::text as total,
      count(*) filter (where status = 'succeeded')::text as succeeded,
      count(*) filter (where status = 'failed')::text as failed,
      coalesce(round(avg(extract(epoch from (finished_at - started_at)) * 1000)
        filter (where finished_at is not null)), 0)::text as avg_ms
    from processing_run
    where organization_id = ${ctx.organizationId}
    group by provider, model
    order by count(*) desc`);
  return (result as unknown as { rows: {
    provider: string | null; model: string | null; total: string;
    succeeded: string; failed: string; avg_ms: string;
  }[] }).rows.map((row) => ({
    provider: row.provider ?? "unknown", model: row.model ?? "unknown",
    total: Number(row.total), succeeded: Number(row.succeeded), failed: Number(row.failed),
    averageDurationMs: Number(row.avg_ms),
  }));
}

/** System worker sweep: content-free state transition for reports stuck in PROCESSING. */
export async function sweepStuckProcessing(
  db: AppDb, olderThanMinutes = 15, now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60_000);
  const stuck = await db.select({
    id: dailyReports.id, organizationId: dailyReports.organizationId,
    projectId: dailyReports.projectId, updatedAt: dailyReports.updatedAt,
  }).from(dailyReports).where(and(
    eq(dailyReports.status, "PROCESSING"), lt(dailyReports.updatedAt, cutoff),
  ));
  for (const row of stuck) {
    await db.update(dailyReports).set({ status: "PROCESSING_FAILED", updatedAt: now })
      .where(and(eq(dailyReports.id, row.id), eq(dailyReports.status, "PROCESSING")));
    await db.update(processingRuns).set({
      status: "failed", errorCategory: "stuck_timeout", finishedAt: now,
    }).where(and(eq(processingRuns.organizationId, row.organizationId),
      eq(processingRuns.reportId, row.id), eq(processingRuns.status, "running")));
    await db.insert(auditEvents).values({
      id: newId(), organizationId: row.organizationId, projectId: row.projectId,
      actorId: "system:processing-sweeper", action: "report.processing_timed_out",
      subjectRef: row.id,
      metadata: { timeoutMinutes: olderThanMinutes },
    });
  }
  return stuck.length;
}
