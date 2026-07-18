import { and, eq, desc } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { reportRevisions } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";
import type { DprStructuredData } from "@buildflow/domain/dpr/schema";

type Revision = typeof reportRevisions.$inferSelect;

export async function addRevision(db: AppDb, ctx: TenantContext, input: {
  reportId: string; structuredData: DprStructuredData; isAiGenerated: boolean;
  summaryInternal?: string; summaryClientSafe?: string; transcript?: unknown;
}): Promise<Revision> {
  const existing = await db.select().from(reportRevisions).where(and(
    eq(reportRevisions.reportId, input.reportId),
    eq(reportRevisions.organizationId, ctx.organizationId),
  ));
  const revisionNumber = existing.length + 1;
  const [row] = await db.insert(reportRevisions).values({
    id: newId(), organizationId: ctx.organizationId, reportId: input.reportId,
    revisionNumber, structuredData: input.structuredData, isAiGenerated: input.isAiGenerated,
    createdBy: ctx.userId, summaryInternal: input.summaryInternal ?? null,
    summaryClientSafe: input.summaryClientSafe ?? null, transcript: input.transcript ?? null,
  }).returning();
  return row;
}

export async function getRevision(db: AppDb, ctx: TenantContext, id: string): Promise<Revision> {
  const [row] = await db.select().from(reportRevisions).where(and(
    eq(reportRevisions.id, id), eq(reportRevisions.organizationId, ctx.organizationId)));
  if (!row) throw new Error("Revision not found");
  return row;
}

export async function latestRevision(db: AppDb, ctx: TenantContext, reportId: string): Promise<Revision | null> {
  const [row] = await db.select().from(reportRevisions).where(and(
    eq(reportRevisions.reportId, reportId), eq(reportRevisions.organizationId, ctx.organizationId)))
    .orderBy(desc(reportRevisions.revisionNumber)).limit(1);
  return row ?? null;
}
