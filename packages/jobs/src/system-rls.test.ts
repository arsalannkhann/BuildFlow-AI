import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { createTestDb } from "@buildflow/db/client";
import { organizations } from "@buildflow/db/schema";
import { enqueueJob } from "./queue";
import { runOnce } from "./runner";

// The worker leases jobs across every tenant, so its queries cannot carry an `app.org_id`.
// Under the RLS-constrained production role that means the lease loop matches zero rows and
// the worker silently idles forever — no job, and therefore no notification email, ever
// runs. System mode is the sanctioned cross-tenant path; these tests pin both halves.
async function asAppRole<T>(db: AppDb, fn: () => Promise<T>): Promise<T> {
  await db.execute(sql`set role buildflow_app`);
  try {
    return await fn();
  } finally {
    await db.execute(sql`reset role`);
  }
}

async function seedJob(db: AppDb): Promise<void> {
  await db.insert(organizations).values({ id: "org-sys", name: "System Mode Org" });
  await enqueueJob(db, {
    organizationId: "org-sys", kind: "test.noop", payload: {}, idempotencyKey: "sys-1",
  });
}

test("the lease loop claims work in system mode under the application role", async () => {
  const db = await createTestDb();
  await seedJob(db);
  let ran = 0;
  const registry = { "test.noop": async () => { ran += 1; } };

  const worked = await asAppRole(db, async () => {
    await db.execute(sql`select set_config('app.system', 'on', false)`);
    try {
      return await runOnce(db, registry);
    } finally {
      await db.execute(sql`select set_config('app.system', 'off', false)`);
    }
  });

  expect(worked).toBe(true);
  expect(ran).toBe(1);
});

test("without system mode the application role leases nothing", async () => {
  const db = await createTestDb();
  await seedJob(db);
  const registry = { "test.noop": async () => { throw new Error("must not run"); } };

  expect(await asAppRole(db, () => runOnce(db, registry))).toBe(false);
});
