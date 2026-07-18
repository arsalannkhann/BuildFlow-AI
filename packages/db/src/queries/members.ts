import { and, eq, isNull } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { memberships, users } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import { capabilitiesForRole, type Role, type TenantContext } from "@buildflow/domain/tenancy";

export type MemberRow = {
  membershipId: string; userId: string; displayName: string; email: string | null;
  role: string | null; projectId: string | null; isActive: boolean;
};

export async function listMembers(
  db: AppDb, ctx: TenantContext, projectId?: string,
): Promise<MemberRow[]> {
  const rows = await db.select({ m: memberships, u: users }).from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(
      eq(memberships.organizationId, ctx.organizationId),
      eq(users.organizationId, ctx.organizationId),
      projectId === undefined ? undefined : eq(memberships.projectId, projectId),
    ));
  return rows.map(({ m, u }) => ({
    membershipId: m.id, userId: u.id, displayName: u.displayName, email: u.email,
    role: m.role, projectId: m.projectId, isActive: u.isActive,
  }));
}

/** One membership per (user, project) — role change updates in place. Capabilities are a
 * snapshot of the role bundle; custom grants can extend them later without a role. */
export async function upsertMembership(db: AppDb, ctx: TenantContext, input: {
  userId: string; projectId: string | null; role: Role;
}): Promise<void> {
  const existing = await db.select().from(memberships).where(and(
    eq(memberships.organizationId, ctx.organizationId),
    eq(memberships.userId, input.userId),
    input.projectId === null
      ? isNull(memberships.projectId)
      : eq(memberships.projectId, input.projectId),
  ));
  const capabilities = capabilitiesForRole(input.role);
  if (existing[0]) {
    await db.update(memberships).set({ role: input.role, capabilities })
      .where(eq(memberships.id, existing[0].id));
    return;
  }
  await db.insert(memberships).values({
    id: newId(), organizationId: ctx.organizationId, projectId: input.projectId,
    userId: input.userId, role: input.role, capabilities,
  });
}

export async function removeMembership(
  db: AppDb, ctx: TenantContext, membershipId: string,
): Promise<void> {
  await db.delete(memberships).where(and(
    eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.organizationId)));
}

export async function createOrgUser(db: AppDb, organizationId: string, input: {
  displayName: string; email: string; roleHint: string;
}): Promise<{ id: string }> {
  const id = newId();
  await db.insert(users).values({
    id, organizationId, displayName: input.displayName,
    email: input.email.trim().toLowerCase(), roleHint: input.roleHint,
  });
  return { id };
}
