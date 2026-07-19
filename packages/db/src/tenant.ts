import { sql } from "drizzle-orm";
import type { TenantContext } from "@buildflow/domain/tenancy";
import type { AppDb } from "./client";

// Runs `fn` inside a transaction with the RLS GUC bound to the caller's organization
// (see drizzle/0002_rls_defense_in_depth.sql). set_config(..., true) is transaction-local,
// so the setting cannot leak across pooled connections.
export async function withTenant<T>(
  db: AppDb,
  ctx: TenantContext,
  fn: (tx: AppDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${ctx.organizationId}, true)`);
    return fn(tx as unknown as AppDb);
  });
}

/**
 * Runs `fn` with read access to the identity tables for a caller that has no tenant yet:
 * sign-in, tenant-context resolution and password-reset issuance all have to find the user
 * before an organization is known (see drizzle/0013_preauth_and_system_rls_paths.sql).
 *
 * Reachable from unauthenticated requests, so the policy behind it is SELECT-only and
 * covers only "user" and "membership" — never use it to widen a write.
 */
export async function withAuthBootstrap<T>(
  db: AppDb,
  fn: (tx: AppDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.auth_bootstrap', 'on', true)`);
    return fn(tx as unknown as AppDb);
  });
}

