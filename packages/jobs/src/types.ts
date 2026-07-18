import type { AppDb } from "@buildflow/db/client";

export type JobMeta = {
  jobId: string;
  organizationId: string;
  attempt: number;
};

// Handlers MUST be idempotent: the runner guarantees at-least-once execution
// (a crash between handler success and completeJob replays the job).
export type JobHandler = (db: AppDb, payload: Record<string, unknown>, meta: JobMeta) => Promise<void>;
export type JobRegistry = Record<string, JobHandler>;
