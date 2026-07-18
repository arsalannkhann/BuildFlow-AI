import { and, eq, desc } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { issuedDocuments } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

type Issued = typeof issuedDocuments.$inferSelect;

export async function addIssued(db: AppDb, ctx: TenantContext, input: {
  reportId: string; revisionId: string; objectKey: string; documentId: string;
  version: number; templateVersion: string;
}): Promise<Issued> {
  const [row] = await db.insert(issuedDocuments).values({
    id: newId(), organizationId: ctx.organizationId, reportId: input.reportId,
    revisionId: input.revisionId, objectKey: input.objectKey, documentId: input.documentId,
    version: input.version, issuedBy: ctx.userId, templateVersion: input.templateVersion,
  }).returning();
  return row;
}

export async function latestIssued(db: AppDb, ctx: TenantContext, reportId: string): Promise<Issued | null> {
  const [row] = await db.select().from(issuedDocuments).where(and(
    eq(issuedDocuments.reportId, reportId), eq(issuedDocuments.organizationId, ctx.organizationId)))
    .orderBy(desc(issuedDocuments.version)).limit(1);
  return row ?? null;
}
