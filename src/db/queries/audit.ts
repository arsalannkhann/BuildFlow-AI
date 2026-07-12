import type { AppDb } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { newId } from "@/domain/ids";
import type { TenantContext } from "@/domain/tenancy";

export async function audit(db: AppDb, ctx: TenantContext, input: {
  action: string; subjectRef: string; metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditEvents).values({
    id: newId(), organizationId: ctx.organizationId, projectId: ctx.projectId ?? null,
    actorId: ctx.userId, action: input.action, subjectRef: input.subjectRef,
    metadata: input.metadata ?? null,
  });
}
