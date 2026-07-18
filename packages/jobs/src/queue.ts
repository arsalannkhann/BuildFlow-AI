import { newId } from "@buildflow/domain/ids";
import type { AppDb } from "@buildflow/db/client";
import { jobs } from "@buildflow/db/schema";

export type EnqueueInput = {
  organizationId: string;
  kind: string;
  payload: Record<string, unknown>;
  /** Same key -> exactly one job row, no matter how often the enqueue retries. */
  idempotencyKey: string;
  runAfter?: Date;
  maxAttempts?: number;
};

// Transactional outbox (ADR-0003): call inside the same transaction as the domain change
// so a committed change always has its job and a rolled-back change never does.
export async function enqueueJob(db: AppDb, input: EnqueueInput): Promise<void> {
  await db.insert(jobs).values({
    id: newId(),
    organizationId: input.organizationId,
    kind: input.kind,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey,
    runAfter: input.runAfter ?? new Date(),
    maxAttempts: input.maxAttempts ?? 5,
  }).onConflictDoNothing({ target: jobs.idempotencyKey });
}
