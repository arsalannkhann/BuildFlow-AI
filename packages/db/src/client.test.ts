import { expect, test } from "vitest";
import { createTestDb } from "./client";
import { organizations } from "./schema";
import { newId } from "@buildflow/domain/ids";

test("migrates and round-trips a row", async () => {
  const db = await createTestDb();
  const id = newId();
  await db.insert(organizations).values({ id, name: "Acme" });
  const rows = await db.select().from(organizations);
  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe("Acme");
});
