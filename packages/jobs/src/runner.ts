import { sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import type { JobRegistry } from "./types";

const LEASE_SECONDS = 120;
const BACKOFF_BASE_SECONDS = 5;
const BACKOFF_CAP_SECONDS = 300;

type JobRow = {
  id: string;
  organization_id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

const rowsOf = (r: unknown): JobRow[] => (r as { rows: JobRow[] }).rows;

// Claims the oldest runnable job with FOR UPDATE SKIP LOCKED so concurrent workers never
// double-lease; expired leases (crashed workers) become claimable again automatically.
async function leaseNext(db: AppDb): Promise<JobRow | null> {
  const res = await db.execute(sql`
    update "job" set
      status = 'leased',
      attempts = attempts + 1,
      leased_until = now() + (${LEASE_SECONDS} || ' seconds')::interval,
      updated_at = now()
    where id = (
      select id from "job"
      where (status = 'queued' and run_after <= now())
         or (status = 'leased' and leased_until < now())
      order by created_at
      limit 1
      for update skip locked
    )
    returning id, organization_id, kind, payload, attempts, max_attempts`);
  return rowsOf(res)[0] ?? null;
}

async function completeJob(db: AppDb, id: string): Promise<void> {
  await db.execute(sql`
    update "job" set status = 'succeeded', leased_until = null, last_error = null, updated_at = now()
    where id = ${id}`);
}

async function failJob(db: AppDb, job: JobRow, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  if (job.attempts >= job.max_attempts) {
    await db.execute(sql`
      update "job" set status = 'dead', leased_until = null, last_error = ${message}, updated_at = now()
      where id = ${job.id}`);
    return;
  }
  const backoff = Math.min(BACKOFF_CAP_SECONDS, BACKOFF_BASE_SECONDS * 2 ** (job.attempts - 1));
  await db.execute(sql`
    update "job" set
      status = 'queued',
      leased_until = null,
      last_error = ${message},
      run_after = now() + (${backoff} || ' seconds')::interval,
      updated_at = now()
    where id = ${job.id}`);
}

/** Leases and runs one job. Returns false when no job was runnable. */
export async function runOnce(db: AppDb, registry: JobRegistry): Promise<boolean> {
  const job = await leaseNext(db);
  if (!job) return false;
  const handler = registry[job.kind];
  if (!handler) {
    await failJob(db, { ...job, attempts: job.max_attempts }, new Error(`No handler for job kind: ${job.kind}`));
    return true;
  }
  try {
    await handler(db, job.payload, {
      jobId: job.id, organizationId: job.organization_id, attempt: job.attempts,
    });
    await completeJob(db, job.id);
  } catch (err) {
    await failJob(db, job, err);
  }
  return true;
}

/** Runs queued jobs until the queue is drained or `max` is reached (inline/dev mode). */
export async function drainJobs(db: AppDb, registry: JobRegistry, max = 50): Promise<number> {
  let ran = 0;
  while (ran < max && (await runOnce(db, registry))) ran += 1;
  return ran;
}
