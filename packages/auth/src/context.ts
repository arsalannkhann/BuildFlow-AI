import { and, eq, isNull, or } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { memberships, users } from "@buildflow/db/schema";
import { withAuthBootstrap } from "@buildflow/db/tenant";
import type { Capability, TenantContext } from "@buildflow/domain/tenancy";
import { CAPABILITIES } from "@buildflow/domain/tenancy";

const KNOWN = new Set<string>(CAPABILITIES);

// Builds the TenantContext for a user, merging org-wide membership (project_id IS NULL)
// with the project-scoped membership when a project is given. Unknown capability strings
// in stored rows are dropped rather than trusted.
export async function resolveTenantContext(
  db: AppDb,
  userId: string,
  projectId?: string,
): Promise<TenantContext> {
  // This runs to *establish* the tenant, so it cannot filter by one yet: both reads go
  // through the pre-auth bootstrap (drizzle/0013_preauth_and_system_rls_paths.sql).
  const { user, rows } = await withAuthBootstrap(db, async (tx) => {
    const userRows = await tx.select().from(users).where(eq(users.id, userId));
    const found = userRows[0];
    if (!found || !found.isActive) throw new Error(`Unknown user: ${userId}`);
    return {
      user: found,
      rows: await tx.select().from(memberships).where(and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, found.organizationId),
        projectId ? or(isNull(memberships.projectId), eq(memberships.projectId, projectId)) : undefined,
      )),
    };
  });
  const caps = new Set<Capability>();
  for (const m of rows) {
    for (const c of m.capabilities) if (KNOWN.has(c)) caps.add(c as Capability);
  }
  return {
    organizationId: user.organizationId,
    projectId: projectId ?? rows.find((m) => m.projectId)?.projectId ?? undefined,
    userId,
    capabilities: [...caps],
  };
}
