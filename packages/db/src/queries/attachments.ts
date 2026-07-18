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

export async function listAttachments(db: AppDb, ctx: TenantContext, reportId: string): Promise<Attachment[]> {
  return db.select().from(attachments).where(and(
    eq(attachments.reportId, reportId), eq(attachments.organizationId, ctx.organizationId)));
}
