import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { createTestDb } from "./client";
import { seedDemo } from "./demo-seed";

test("demo seed is realistic, synthetic, complete, and idempotent", async () => {
  const db = await createTestDb();
  await seedDemo(db);
  await seedDemo(db);
  const counts = await db.execute(sql`select
    (select count(*)::int from project where organization_id = 'seed-org') as projects,
    (select count(*)::int from daily_report where organization_id = 'seed-org') as reports,
    (select count(*)::int from material where organization_id = 'seed-org') as materials,
    (select count(*)::int from budget where organization_id = 'seed-org') as budgets,
    (select count(*)::int from mb_entry where organization_id = 'seed-org') as mb_entries`);
  expect((counts as unknown as { rows: Record<string, number>[] }).rows[0]).toEqual({
    projects: 2, reports: 28, materials: 4, budgets: 2, mb_entries: 6,
  });
});
