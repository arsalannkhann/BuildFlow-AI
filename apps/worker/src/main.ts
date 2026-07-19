import { enableSystemMode, getDb } from "@buildflow/db/client";
import { runOnce } from "@buildflow/jobs/runner";
import { pipelineJobRegistry } from "@buildflow/pipeline/jobs";
import { sweepMissingReports } from "@buildflow/pipeline/missing-reports";
import { errorCategory, logEvent } from "@buildflow/observability/logger";
import { sweepStuckProcessing } from "@buildflow/db/queries/operations";
import { enqueueRetentionSweeps } from "@buildflow/lifecycle/retention";

const POLL_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    // PGlite is a single-process database: a second process cannot share the data dir.
    logEvent("error", "worker.configuration_invalid", { errorCategory: "database_url_missing" });
    process.exit(1);
  }
  // The lease loop and the sweeps below span every tenant, so this process has no single
  // app.org_id to bind and needs the sanctioned cross-tenant path. Must precede getDb().
  enableSystemMode();
  const db = await getDb();
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  logEvent("info", "worker.started");
  let lastSweep = 0;
  let lastRetentionSchedule = 0;
  let lastMissingCheck = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastSweep >= 60_000) {
        const count = await sweepStuckProcessing(db);
        if (count > 0) logEvent("warn", "processing.stuck_swept", { count });
        lastSweep = Date.now();
      }
      if (Date.now() - lastMissingCheck >= 5 * 60_000) {
        const count = await sweepMissingReports(db);
        if (count > 0) logEvent("info", "reports.missing_flagged", { count });
        lastMissingCheck = Date.now();
      }
      if (Date.now() - lastRetentionSchedule >= 60 * 60_000) {
        const count = await enqueueRetentionSweeps(db);
        logEvent("info", "retention.sweeps_scheduled", { count });
        lastRetentionSchedule = Date.now();
      }
      const worked = await runOnce(db, pipelineJobRegistry);
      if (!worked) await sleep(POLL_MS);
    } catch (err) {
      logEvent("error", "worker.loop_failed", { errorCategory: errorCategory(err) });
      await sleep(POLL_MS);
    }
  }
  logEvent("info", "worker.stopped");
}

void main();
