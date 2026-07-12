import { eq } from "drizzle-orm";
import type { AppDb } from "./client";
import { organizations, projects, users, memberships } from "./schema";
import type { Capability } from "@/domain/tenancy";

export const SEED = {
  orgId: "seed-org", projectId: "seed-project",
  engineer: { id: "seed-engineer", displayName: "Site Engineer",
    capabilities: ["report.create", "report.review"] as Capability[] },
  manager: { id: "seed-manager", displayName: "Project Manager",
    capabilities: ["report.review", "report.approve", "report.issue"] as Capability[] },
};

export async function seed(db: AppDb): Promise<void> {
  const existing = await db.select().from(organizations).where(eq(organizations.id, SEED.orgId));
  if (existing.length > 0) return;

  await db.insert(organizations).values({ id: SEED.orgId, name: "Demo Contractor Pvt Ltd" });
  await db.insert(projects).values({ id: SEED.projectId, organizationId: SEED.orgId,
    name: "Sector 62 Tower A", clientName: "NCR Developers", timezone: "Asia/Kolkata" });

  for (const u of [SEED.engineer, SEED.manager]) {
    await db.insert(users).values({ id: u.id, organizationId: SEED.orgId,
      displayName: u.displayName, roleHint: u.id === SEED.engineer.id ? "site_engineer" : "project_manager" });
    await db.insert(memberships).values({ id: `m-${u.id}`, organizationId: SEED.orgId,
      projectId: SEED.projectId, userId: u.id, capabilities: u.capabilities });
  }
}
