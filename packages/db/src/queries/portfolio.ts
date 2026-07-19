import { eq, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { memberships } from "@buildflow/db/schema";
import type { TenantContext } from "@buildflow/domain/tenancy";

// Portfolio scoping (Phase E2): people see only projects they belong to. An org-wide
// membership (project_id IS NULL) covers every project; otherwise the project-scoped
// membership list is the boundary.
export type MembershipScope = { orgWide: boolean; projectIds: string[] };

export async function userMembershipScope(db: AppDb, ctx: TenantContext): Promise<MembershipScope> {
  const rows = await db.select().from(memberships).where(sql`
    ${memberships.userId} = ${ctx.userId}
    and ${memberships.organizationId} = ${ctx.organizationId}`);
  return {
    orgWide: rows.some((m) => m.projectId === null),
    projectIds: [...new Set(rows.map((m) => m.projectId).filter((p): p is string => p !== null))],
  };
}

// Processing-reliability tile: job dead/fail counts from the queue table (rules.md §16 —
// IDs and state only; payloads are never surfaced). Doubles as the provider-health view.
export type JobHealth = {
  dead: number;
  retrying: number; // queued with a recorded error = failed at least once, will retry
  queued: number;
  succeeded: number;
};

export async function jobHealth(db: AppDb, ctx: TenantContext): Promise<JobHealth> {
  const res = await db.execute(sql`
    select
      count(*) filter (where status = 'dead')::text as dead,
      count(*) filter (where status = 'queued' and last_error is not null)::text as retrying,
      count(*) filter (where status in ('queued', 'leased') and last_error is null)::text as queued,
      count(*) filter (where status = 'succeeded')::text as succeeded
    from "job"
    where organization_id = ${ctx.organizationId}`);
  const row = (res as unknown as { rows: Record<string, string>[] }).rows[0] ?? {};
  return {
    dead: Number(row.dead ?? 0), retrying: Number(row.retrying ?? 0),
    queued: Number(row.queued ?? 0), succeeded: Number(row.succeeded ?? 0),
  };
}
