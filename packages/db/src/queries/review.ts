import type { AppDb } from "@buildflow/db/client";
import { reviewDecisions } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export async function recordDecision(db: AppDb, ctx: TenantContext, input: {
  reportId: string; revisionId?: string; decision: "approve" | "reject" | "edit";
  reason?: string; fieldPath?: string; beforeValue?: unknown; afterValue?: unknown;
}): Promise<void> {
  await db.insert(reviewDecisions).values({
    id: newId(), organizationId: ctx.organizationId, reportId: input.reportId,
    revisionId: input.revisionId ?? null, actorId: ctx.userId, decision: input.decision,
    reason: input.reason ?? null, fieldPath: input.fieldPath ?? null,
    beforeValue: input.beforeValue ?? null, afterValue: input.afterValue ?? null,
  });
}
