import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../client";
import { dailyReports } from "../schema";

// Proves the defense-in-depth layer independently of app-layer filtering: as a
// non-owner role with FORCE RLS, rows are invisible without the tenant GUC and
// writes to another tenant are rejected, even if application code forgot a filter.
test("RLS fails closed for a non-owner role without/with the tenant GUC", async () => {
  const db = await createTestDb();
  await db.execute(sql`select set_config('app.org_id', 'org-a', false)`);
  await db.insert(dailyReports).values({
    id: "r-a", organizationId: "org-a", projectId: "p-a", reportDate: "2026-07-19",
    status: "UPLOADED", createdBy: "u-a",
  });
  await db.execute(sql`select set_config('app.org_id', '', false)`);

  await db.execute(sql`set role buildflow_app`);
  try {
    // no GUC -> zero rows even though the table has data
    const hidden = await db.select().from(dailyReports);
    expect(hidden.length).toBe(0);

    // matching GUC -> row visible
    await db.execute(sql`select set_config('app.org_id', 'org-a', false)`);
    const visible = await db.select().from(dailyReports);
    expect(visible.map((r) => r.id)).toEqual(["r-a"]);

    // cross-tenant write is rejected by WITH CHECK
    await expect(
      db.insert(dailyReports).values({
        id: "r-b", organizationId: "org-b", projectId: "p-b", reportDate: "2026-07-19",
        status: "UPLOADED", createdBy: "u-b",
      }),
    ).rejects.toThrow(/row-level security/i);
  } finally {
    await db.execute(sql`reset role`);
  }
});
