import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../client";
import { consumeRateLimit } from "./rate-limits";

test("rate limits are shared by hashed key and reset on the next window", async () => {
  const db = await createTestDb();
  const now = new Date("2026-07-19T10:00:00Z");
  expect((await consumeRateLimit(db, { scope: "login", key: "ip:email", limit: 2, windowMs: 60_000, now })).allowed).toBe(true);
  expect((await consumeRateLimit(db, { scope: "login", key: "ip:email", limit: 2, windowMs: 60_000, now })).remaining).toBe(0);
  expect((await consumeRateLimit(db, { scope: "login", key: "ip:email", limit: 2, windowMs: 60_000, now })).allowed).toBe(false);
  expect((await consumeRateLimit(db, { scope: "login", key: "ip:email", limit: 2, windowMs: 60_000, now: new Date(now.getTime() + 60_000) })).allowed).toBe(true);
  const rows = (await db.execute(sql`select key_hash from rate_limit_bucket`)) as unknown as { rows: { key_hash: string }[] };
  expect(rows.rows.every((row) => !row.key_hash.includes("ip:email"))).toBe(true);
});
