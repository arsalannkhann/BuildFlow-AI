import { and, eq, isNull, or } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { memberships, users } from "@buildflow/db/schema";
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
  const userRows = await db.select().from(users).where(eq(users.id, userId));
  const user = userRows[0];
  if (!user || !user.isActive) throw new Error(`Unknown user: ${userId}`);

  const rows = await db.select().from(memberships).where(and(
    eq(memberships.userId, userId),
    eq(memberships.organizationId, user.organizationId),
    projectId ? or(isNull(memberships.projectId), eq(memberships.projectId, projectId)) : undefined,
  ));
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
