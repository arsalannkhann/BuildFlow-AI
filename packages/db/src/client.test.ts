import { expect, test } from "vitest";
import { createTestDb, getSystemDb } from "./client";
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

test("getSystemDb reuses the given handle when RLS needs no separate system pool", async () => {
  // No DATABASE_URL in tests: PGlite runs as the bootstrap superuser and bypasses RLS, so the
  // inline job-drain path must keep using the very handle it was given (in a test, the
  // per-test in-memory db) rather than a global singleton pointed at a different database.
  const db = await createTestDb();
  expect(process.env.DATABASE_URL).toBeUndefined();
  expect(await getSystemDb(db)).toBe(db);
});
