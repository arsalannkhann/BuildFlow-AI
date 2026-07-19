import type { AppDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import {
  auditEvents, authCredentials, memberships, organizations, users,
} from "@buildflow/db/schema";
import { capabilitiesForRole, type TenantContext } from "@buildflow/domain/tenancy";
import { newId } from "@buildflow/domain/ids";
import { hashPassword } from "@buildflow/domain/security/password";

export type OrganizationRegistration = {
  organizationName: string;
  ownerName: string;
  email: string;
  password: string;
};

export async function registerOrganizationOwner(
  db: AppDb,
  input: OrganizationRegistration,
): Promise<{ organizationId: string; userId: string; email: string }> {
  const organizationName = input.organizationName.trim();
  const ownerName = input.ownerName.trim();
  const email = input.email.trim().toLowerCase();
  if (organizationName.length < 2 || organizationName.length > 120) {
    throw new Error("Organization name must be between 2 and 120 characters");
  }
  if (ownerName.length < 2 || ownerName.length > 100) {
    throw new Error("Owner name must be between 2 and 100 characters");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 12) throw new Error("Password must be at least 12 characters");

  const organizationId = newId();
  const userId = newId();
  const capabilities = capabilitiesForRole("org_owner");
  const ctx: TenantContext = { organizationId, userId, capabilities };

  await withTenant(db, ctx, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: organizationName });
    await tx.insert(users).values({
      id: userId, organizationId, displayName: ownerName, roleHint: "org_owner", email,
    });
    await tx.insert(memberships).values({
      id: newId(), organizationId, projectId: null, userId, role: "org_owner", capabilities,
    });
    await tx.insert(authCredentials).values({ userId, passwordHash: hashPassword(input.password) });
    await tx.insert(auditEvents).values({
      id: newId(), organizationId, actorId: userId,
      action: "organization.created", subjectRef: organizationId,
      metadata: { source: "self_service_registration" },
    });
  });

  return { organizationId, userId, email };
}
