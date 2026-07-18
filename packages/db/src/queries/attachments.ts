import { and, eq } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { attachments } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

type Attachment = typeof attachments.$inferSelect;

export async function addAttachment(db: AppDb, ctx: TenantContext, input: {
  reportId: string; kind: "audio" | "photo"; objectKey: string; contentType: string;
  byteSize: number; checksum: string;
}): Promise<Attachment> {
  if (!ctx.projectId) throw new Error("projectId required");
  const [row] = await db.insert(attachments).values({
    id: newId(), organizationId: ctx.organizationId, projectId: ctx.projectId,
    reportId: input.reportId, kind: input.kind, objectKey: input.objectKey,
    contentType: input.contentType, byteSize: input.byteSize, checksum: input.checksum,
  }).returning();
  return row;
}

export async function getAttachment(
  db: AppDb, ctx: TenantContext, attachmentId: string,
): Promise<Attachment | null> {
  const [row] = await db.select().from(attachments).where(and(
    eq(attachments.id, attachmentId), eq(attachments.organizationId, ctx.organizationId)));
  return row ?? null;
}

/** Creates a manifest attachment row (content not yet uploaded). Idempotent per
 * (report, clientAttachmentId): a retried manifest returns the existing row. */
export async function upsertManifestAttachment(db: AppDb, ctx: TenantContext, input: {
  reportId: string; clientAttachmentId: string; kind: "audio" | "photo" | "document";
  objectKey: string; contentType: string; byteSize: number; checksum: string;
  capturedAt?: Date;
}): Promise<Attachment> {
  if (!ctx.projectId) throw new Error("projectId required");
  const existing = await db.select().from(attachments).where(and(
    eq(attachments.reportId, input.reportId),
    eq(attachments.organizationId, ctx.organizationId),
    eq(attachments.clientAttachmentId, input.clientAttachmentId),
  ));
  if (existing[0]) return existing[0];
  const [row] = await db.insert(attachments).values({
    id: newId(), organizationId: ctx.organizationId, projectId: ctx.projectId,
    reportId: input.reportId, kind: input.kind, objectKey: input.objectKey,
    contentType: input.contentType, byteSize: input.byteSize, checksum: input.checksum,
    clientAttachmentId: input.clientAttachmentId, capturedAt: input.capturedAt ?? null,
  }).onConflictDoNothing().returning();
  if (row) return row;
  const [raced] = await db.select().from(attachments).where(and(
    eq(attachments.reportId, input.reportId),
    eq(attachments.organizationId, ctx.organizationId),
    eq(attachments.clientAttachmentId, input.clientAttachmentId),
  ));
  return raced;
}

export async function markAttachmentUploaded(
  db: AppDb, ctx: TenantContext, attachmentId: string,
): Promise<void> {
  await db.update(attachments).set({ uploadedAt: new Date() }).where(and(
    eq(attachments.id, attachmentId), eq(attachments.organizationId, ctx.organizationId)));
}

export async function listAttachments(db: AppDb, ctx: TenantContext, reportId: string): Promise<Attachment[]> {
  return db.select().from(attachments).where(and(
    eq(attachments.reportId, reportId), eq(attachments.organizationId, ctx.organizationId)));
}
