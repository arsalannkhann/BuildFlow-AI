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
