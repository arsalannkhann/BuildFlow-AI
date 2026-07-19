import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { newId } from "@buildflow/domain/ids";

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: Date };

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Distributed fixed-window limiter. Raw identifiers never enter the database. */
export async function consumeRateLimit(db: AppDb, input: {
  scope: string; key: string; limit: number; windowMs: number; now?: Date;
}): Promise<RateLimitResult> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.windowMs < 1_000) {
    throw new Error("Invalid rate-limit configuration");
  }
  const now = input.now ?? new Date();
  const startMs = Math.floor(now.getTime() / input.windowMs) * input.windowMs;
  const windowStart = new Date(startMs);
  const resetAt = new Date(startMs + input.windowMs);
  const keyHash = hash(input.key);
  const result = await db.execute(sql`
    insert into "rate_limit_bucket" (id, scope, key_hash, window_start, count, expires_at)
    values (${newId()}, ${input.scope}, ${keyHash}, ${windowStart}, 1, ${resetAt})
    on conflict (scope, key_hash, window_start)
    do update set count = "rate_limit_bucket".count + 1
    returning count`);
  const count = Number((result as unknown as { rows: { count: number }[] }).rows[0]?.count ?? 1);
  // Low-cost opportunistic cleanup; never includes customer identifiers.
  if (count === 1 && Math.random() < 0.02) {
    await db.execute(sql`delete from "rate_limit_bucket" where expires_at < ${now}`);
  }
  return { allowed: count <= input.limit, remaining: Math.max(0, input.limit - count), resetAt };
}
