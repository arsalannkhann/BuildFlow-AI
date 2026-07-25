import { expect, test } from "vitest";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { DevAuthAdapter } from "@buildflow/auth/dev";
import { listMembers } from "@buildflow/db/queries/members";
import { listActivities, listLocations } from "@buildflow/db/queries/reference";
import {
  acceptInvitationAndCreateAccount, changeMemberRole, createProjectAsAdmin,
  importActivitiesCsv, importLocationsCsv, inviteMember,
} from "./admin-core";

async function setup() {
  const db = await createTestDb();
  await seed(db);
  const owner = await resolveTenantContext(db, SEED.owner.id, SEED.projectId);
  return { db, owner };
}

test("owner creates a project; engineer cannot", async () => {
  const { db, owner } = await setup();
  const projectId = await createProjectAsAdmin(db, owner, { name: "Metro Depot B" });
  expect(projectId).toBeTruthy();
  const engineer = await resolveTenantContext(db, SEED.engineer.id, SEED.projectId);
  await expect(createProjectAsAdmin(db, engineer, { name: "Nope" })).rejects.toThrow(/not permitted/i);
});

test("invitation round-trip: invite -> accept creates user+credential+membership -> can sign in; token single-use", async () => {
  const { db, owner } = await setup();
  const invite = await inviteMember(db, owner, {
    email: "qs@example.com", role: "quantity_surveyor", projectId: SEED.projectId,
  });
  expect(invite.organizationName).toBe("Demo Contractor Pvt Ltd");
  expect(invite.projectName).toBe("Sector 62 Tower A");
  const accepted = await acceptInvitationAndCreateAccount(db, {
    token: invite.token, displayName: "QS Person", password: "strong-password-1",
  });
  expect(accepted).not.toBeNull();

  const signedIn = await new DevAuthAdapter().signInWithPassword(db, "qs@example.com", "strong-password-1");
  expect(signedIn?.userId).toBe(accepted!.userId);

  const ctx = await resolveTenantContext(db, accepted!.userId, SEED.projectId);
  expect(ctx.capabilities).toContain("mb.certify");
  expect(ctx.capabilities).not.toContain("report.approve");

  // token is single-use
  expect(await acceptInvitationAndCreateAccount(db, {
    token: invite.token, displayName: "Again", password: "strong-password-1",
  })).toBeNull();
});

test("role change updates capability snapshot", async () => {
  const { db, owner } = await setup();
  await changeMemberRole(db, owner, {
    userId: SEED.engineer.id, projectId: SEED.projectId, role: "project_manager",
  });
  const ctx = await resolveTenantContext(db, SEED.engineer.id, SEED.projectId);
  expect(ctx.capabilities).toContain("report.approve");
  const members = await listMembers(db, owner, SEED.projectId);
  expect(members.find((m) => m.userId === SEED.engineer.id)?.role).toBe("project_manager");
});

test("CSV imports build the hierarchy and activities; re-import is idempotent", async () => {
  const { db, owner } = await setup();
  const csv = [
    "name,kind,parent",
    "Tower A,building,",
    "Level 3,floor,Tower A",
    '"Flat 301, East",room,Level 3',
  ].join("\n");
  expect((await importLocationsCsv(db, owner, SEED.projectId, csv)).imported).toBe(3);
  expect((await importLocationsCsv(db, owner, SEED.projectId, csv)).imported).toBe(0);
  const locations = await listLocations(db, owner, SEED.projectId);
  const level3 = locations.find((l) => l.name === "Level 3");
  expect(level3?.parentId).toBe(locations.find((l) => l.name === "Tower A")?.id);

  await importActivitiesCsv(db, owner, SEED.projectId, "name,unit,location\nBlockwork,sqm,Level 3\nShuttering,sqm,");
  const activities = await listActivities(db, owner, SEED.projectId);
  expect(activities.map((a) => a.name).sort()).toEqual(["Blockwork", "Shuttering"]);
  expect(activities.find((a) => a.name === "Blockwork")?.locationId).toBe(level3?.id);

  await expect(importLocationsCsv(db, owner, SEED.projectId, "name,kind\nX,castle"))
    .rejects.toThrow(/unknown kind/i);
});
