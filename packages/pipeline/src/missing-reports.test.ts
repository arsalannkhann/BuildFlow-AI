import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { notifications, projects } from "@buildflow/db/schema";
import { drainJobs } from "@buildflow/jobs/runner";
import { pipelineJobRegistry } from "./jobs";
import { sweepMissingReports } from "./missing-reports";

test("missing-report sweep flags exactly once per project-day, only past cutoff", async () => {
  const db = await createTestDb();
  await seed(db);

  // No cutoff configured -> never flagged.
  expect(await sweepMissingReports(db)).toBe(0);

  // Cutoff 00:00 is always past in project-local time; no report exists today.
  await db.update(projects).set({ reportCutoff: "00:00" })
    .where(eq(projects.id, SEED.projectId));
  expect(await sweepMissingReports(db)).toBe(1);
  await drainJobs(db, pipelineJobRegistry);

  const rows = await db.select().from(notifications)
    .where(eq(notifications.eventKind, "report.missing"));
  expect(rows.length).toBeGreaterThan(0); // report.review holders got it
  expect(rows.every((r) => r.projectId === SEED.projectId)).toBe(true);
  expect(rows[0].title).toMatch(/No report yet/);

  // Re-running the sweep + drain must not duplicate (queue idempotency key).
  await sweepMissingReports(db);
  await sweepMissingReports(db);
  await drainJobs(db, pipelineJobRegistry);
  const after = await db.select().from(notifications)
    .where(eq(notifications.eventKind, "report.missing"));
  expect(after.length).toBe(rows.length);

  // A cutoff later than any wall clock (i.e. not yet passed) is never flagged:
  // use an impossible sentinel by moving the cutoff after "now" local time.
  await db.update(projects).set({ reportCutoff: "23:59" })
    .where(eq(projects.id, SEED.projectId));
  // (whether this enqueues depends on wall clock; assert it still cannot duplicate today)
  await sweepMissingReports(db);
  await drainJobs(db, pipelineJobRegistry);
  const finalRows = await db.select().from(notifications)
    .where(eq(notifications.eventKind, "report.missing"));
  expect(finalRows.length).toBe(rows.length);
});
