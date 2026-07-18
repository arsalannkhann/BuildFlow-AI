import { and, eq } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { processingRuns, processingStages } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export async function startRun(db: AppDb, ctx: TenantContext, input: {
  reportId: string; provider: string; model: string; promptVersion: string; schemaVersion: string;
}): Promise<string> {
  const id = newId();
  await db.insert(processingRuns).values({
    id, organizationId: ctx.organizationId, reportId: input.reportId, status: "running",
    provider: input.provider, model: input.model, promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
  });
  return id;
}

export async function finishRun(db: AppDb, ctx: TenantContext, runId: string,
  status: "succeeded" | "failed", errorCategory?: string): Promise<void> {
  await db.update(processingRuns).set({ status, errorCategory: errorCategory ?? null, finishedAt: new Date() })
    .where(and(eq(processingRuns.id, runId), eq(processingRuns.organizationId, ctx.organizationId)));
}

export async function recordStage(db: AppDb, runId: string, name: string,
  status: "succeeded" | "failed", attempt: number, errorCategory?: string): Promise<void> {
  await db.insert(processingStages).values({
    id: newId(), processingRunId: runId, name, status, attempt, errorCategory: errorCategory ?? null,
    finishedAt: new Date(),
  });
}
