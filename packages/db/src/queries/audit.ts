import type { AppDb } from "@buildflow/db/client";
import { auditEvents } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export async function audit(db: AppDb, ctx: TenantContext, input: {
  action: string; subjectRef: string; metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditEvents).values({
    id: newId(), organizationId: ctx.organizationId, projectId: ctx.projectId ?? null,
    actorId: ctx.userId, action: input.action, subjectRef: input.subjectRef,
    metadata: input.metadata ?? null,
  });
}
