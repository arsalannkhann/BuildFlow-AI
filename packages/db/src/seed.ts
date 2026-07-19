import { eq } from "drizzle-orm";
import { capabilitiesForRole } from "@buildflow/domain/tenancy";
import type { AppDb } from "./client";
import { organizations, projects, users, memberships, authCredentials } from "./schema";

// Demo credentials for the seeded local org. Production never seeds these implicitly;
// the password is public by design and may only guard synthetic demo data.
export const DEMO_PASSWORD = "buildflow-demo";

export const SEED = {
  orgId: "seed-org", projectId: "seed-project",
  owner: {
    id: "seed-owner", displayName: "Organization Owner",
    email: "owner@demo.buildflow.local", role: "org_owner" as const,
    capabilities: capabilitiesForRole("org_owner"),
  },
  engineer: {
    id: "seed-engineer", displayName: "Site Engineer",
    email: "engineer@demo.buildflow.local", role: "site_engineer" as const,
    capabilities: capabilitiesForRole("site_engineer"),
  },
  manager: {
    id: "seed-manager", displayName: "Project Manager",
    email: "manager@demo.buildflow.local", role: "project_manager" as const,
    capabilities: capabilitiesForRole("project_manager"),
  },
};

export async function seed(db: AppDb): Promise<void> {
  await db.insert(organizations)
    .values({ id: SEED.orgId, name: "Demo Contractor Pvt Ltd" })
    .onConflictDoNothing();
  await db.insert(projects).values({
    id: SEED.projectId, organizationId: SEED.orgId,
    name: "Sector 62 Tower A", clientName: "NCR Developers", timezone: "Asia/Kolkata",
  }).onConflictDoNothing();

  // Hash lazily so importing SEED never pays scrypt cost.
  const { hashPassword } = await import("@buildflow/domain/security/password");
  const passwordHash = hashPassword(DEMO_PASSWORD);

  for (const u of [SEED.owner, SEED.engineer, SEED.manager]) {
    await db.insert(users).values({
      id: u.id, organizationId: SEED.orgId, displayName: u.displayName,
      roleHint: u.role, email: u.email,
    }).onConflictDoNothing();
    // Older seeds predate email/role columns; keep existing rows current.
    await db.update(users).set({ email: u.email, roleHint: u.role }).where(eq(users.id, u.id));
    // The owner's membership is org-wide (projectId null); others are project-scoped.
    const projectId = u.role === "org_owner" ? null : SEED.projectId;
    await db.insert(memberships).values({
      id: `m-${u.id}`, organizationId: SEED.orgId, projectId,
      userId: u.id, role: u.role, capabilities: u.capabilities,
    }).onConflictDoNothing();
    await db.update(memberships)
      .set({ role: u.role, capabilities: u.capabilities })
      .where(eq(memberships.id, `m-${u.id}`));
    await db.insert(authCredentials).values({ userId: u.id, passwordHash }).onConflictDoNothing();
  }
}
