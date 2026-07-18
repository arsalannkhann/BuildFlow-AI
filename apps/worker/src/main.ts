import { getDb } from "@buildflow/db/client";
import { runOnce } from "@buildflow/jobs/runner";
import { pipelineJobRegistry } from "@buildflow/pipeline/jobs";

const POLL_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    // PGlite is a single-process database: a second process cannot share the data dir.
    console.error(
      "The worker requires DATABASE_URL (real PostgreSQL). " +
      "In PGlite mode, leave JOBS_MODE=inline so the web app runs jobs itself (ADR-0003).",
    );
    process.exit(1);
  }
  const db = await getDb();
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log("buildflow-worker: started (poll %dms)", POLL_MS);
  while (!stopping) {
    try {
      const worked = await runOnce(db, pipelineJobRegistry);
      if (!worked) await sleep(POLL_MS);
    } catch (err) {
      console.error("buildflow-worker: loop error", err);
      await sleep(POLL_MS);
    }
  }
  console.log("buildflow-worker: stopped");
}

void main();
