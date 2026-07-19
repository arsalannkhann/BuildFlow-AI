import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { authCredentials, invitations, memberships, users } from "@buildflow/db/schema";
import { hashPassword } from "@buildflow/domain/security/password";
import { newId } from "@buildflow/domain/ids";
import { capabilitiesForRole, type Role, type TenantContext } from "@buildflow/domain/tenancy";
import { withPublicToken, withTenant } from "@buildflow/db/tenant";

const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationRow = typeof invitations.$inferSelect;

/** Creates an invitation and returns the raw token exactly once (only its hash is stored). */
export async function createInvitation(db: AppDb, ctx: TenantContext, input: {
  email?: string; mobile?: string; role: Role; projectId?: string | null;
}): Promise<{ id: string; token: string; expiresAt: Date }> {
  if (!input.email && !input.mobile) throw new Error("Email or mobile required");
  const token = randomBytes(32).toString("base64url");
  const id = newId();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await db.insert(invitations).values({
    id, organizationId: ctx.organizationId, projectId: input.projectId ?? null,
    email: input.email?.trim().toLowerCase() ?? null, mobile: input.mobile ?? null,
    role: input.role, tokenHash: tokenHash(token), invitedBy: ctx.userId, expiresAt,
  });
  return { id, token, expiresAt };
}

export async function listInvitations(
  db: AppDb, ctx: TenantContext, projectId?: string,
): Promise<InvitationRow[]> {
  return db.select().from(invitations).where(and(
    eq(invitations.organizationId, ctx.organizationId),
    projectId === undefined ? undefined : eq(invitations.projectId, projectId),
  )).orderBy(desc(invitations.createdAt));
}

export async function revokeInvitation(
  db: AppDb, ctx: TenantContext, invitationId: string,
): Promise<void> {
  await db.update(invitations).set({ status: "revoked" }).where(and(
    eq(invitations.id, invitationId), eq(invitations.organizationId, ctx.organizationId),
    eq(invitations.status, "pending")));
}

/** Token-authenticated lookup for the public accept page (no session exists yet). */
export async function findPendingInvitation(
  db: AppDb, token: string,
): Promise<InvitationRow | null> {
  // The token is the credential and the row it finds is what names the tenant, so this
  // single read runs on the public-token path; everything after it is tenant-scoped.
  const [row] = await withPublicToken(db, (tx) => tx.select().from(invitations)
    .where(eq(invitations.tokenHash, tokenHash(token))));
  if (!row || row.status !== "pending") return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

/** Creates the user + credential + membership for a pending invitation, atomically.
 * Idempotence: a second accept of the same token fails on status=pending check. */
export async function acceptInvitation(db: AppDb, input: {
  token: string; displayName: string; password: string; email?: string;
}): Promise<{ userId: string; organizationId: string; email: string } | null> {
  const invitation = await findPendingInvitation(db, input.token);
  if (!invitation) return null;
  // Mobile-number invitations carry no email; the acceptor supplies one for sign-in.
  const email = (invitation.email ?? input.email)?.trim().toLowerCase();
  if (!email) throw new Error("Email required to create the account");
  const role = invitation.role as Role;
  const userId = newId();
  // The invitation named the organization, so the account creation itself is ordinary
  // tenant-scoped work — user, credential, membership and the status flip all commit
  // together under that organization's RLS context.
  const inviteCtx: TenantContext = {
    organizationId: invitation.organizationId, userId, capabilities: [],
  };
  await withTenant(db, inviteCtx, async (tx) => {
    await tx.insert(users).values({
      id: userId, organizationId: invitation.organizationId,
      displayName: input.displayName,
      email, roleHint: role,
    });
    await tx.insert(authCredentials).values({
      userId, passwordHash: hashPassword(input.password),
    });
    await tx.insert(memberships).values({
      id: newId(), organizationId: invitation.organizationId,
      projectId: invitation.projectId, userId, role,
      capabilities: capabilitiesForRole(role),
    });
    const updated = await tx.update(invitations)
      .set({ status: "accepted", acceptedUserId: userId })
      .where(and(eq(invitations.id, invitation.id), eq(invitations.status, "pending")))
      .returning();
    if (updated.length === 0) throw new Error("Invitation already used");
  });
  return { userId, organizationId: invitation.organizationId, email };
}
