import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@buildflow/db/client";
import { jobs } from "@buildflow/db/schema";
import { enqueueJob } from "./queue";
import { drainJobs, runOnce } from "./runner";

test("enqueue is idempotent per idempotency key", async () => {
  const db = await createTestDb();
  for (let i = 0; i < 3; i += 1) {
    await enqueueJob(db, {
      organizationId: "org-a", kind: "noop", payload: { n: 1 }, idempotencyKey: "noop:1",
    });
  }
  expect((await db.select().from(jobs)).length).toBe(1);
});

test("runOnce executes the handler and completes the job", async () => {
  const db = await createTestDb();
  const seen: string[] = [];
  await enqueueJob(db, {
    organizationId: "org-a", kind: "echo", payload: { v: "hello" }, idempotencyKey: "echo:1",
  });
  const worked = await runOnce(db, {
    echo: async (_db, payload, meta) => {
      seen.push(`${payload.v}:${meta.organizationId}:${meta.attempt}`);
    },
  });
  expect(worked).toBe(true);
  expect(seen).toEqual(["hello:org-a:1"]);
  const [row] = await db.select().from(jobs);
  expect(row.status).toBe("succeeded");
  expect(await runOnce(db, {})).toBe(false); // queue drained
});

test("failing handler backs off, then goes dead at max attempts; retries never duplicate effects", async () => {
  const db = await createTestDb();
  let calls = 0;
  await enqueueJob(db, {
    organizationId: "org-a", kind: "boom", payload: {}, idempotencyKey: "boom:1", maxAttempts: 2,
  });
  const registry = { boom: async () => { calls += 1; throw new Error("nope"); } };

  expect(await runOnce(db, registry)).toBe(true); // attempt 1 -> requeued with backoff
  let [row] = await db.select().from(jobs);
  expect(row.status).toBe("queued");
  expect(row.lastError).toMatch(/nope/);

  await db.execute(sql`update "job" set run_after = now()`); // skip the backoff wait
  expect(await runOnce(db, registry)).toBe(true); // attempt 2 -> dead
  [row] = await db.select().from(jobs);
  expect(row.status).toBe("dead");
  expect(calls).toBe(2);
});

test("unknown job kind is parked dead, not retried forever", async () => {
  const db = await createTestDb();
  await enqueueJob(db, {
    organizationId: "org-a", kind: "ghost", payload: {}, idempotencyKey: "ghost:1",
  });
  await drainJobs(db, {});
  const [row] = await db.select().from(jobs);
  expect(row.status).toBe("dead");
  expect(row.lastError).toMatch(/no handler/i);
});
