import { expect, test } from "vitest";
import { createTestDb } from "./client";
import { seed, SEED } from "./seed";
import { users } from "./schema";

test("seed is idempotent and creates org/project/2 users", async () => {
  const db = await createTestDb();
  await seed(db);
  await seed(db);
  const rows = await db.select().from(users);
  expect(rows).toHaveLength(2);
  expect(SEED.engineer.capabilities).toContain("report.create");
  expect(SEED.manager.capabilities).toContain("report.approve");
});
