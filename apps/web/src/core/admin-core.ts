import type { AppDb } from "@buildflow/db/client";
import type { TenantContext, Role } from "@buildflow/domain/tenancy";
import { assertCan, ROLES } from "@buildflow/domain/tenancy";
import { csvRecords, parseCsv } from "@buildflow/domain/csv";
import {
  createProject, getProject, updateProject, type ProjectSettings,
} from "@buildflow/db/queries/projects";
import { upsertMembership } from "@buildflow/db/queries/members";
import {
  acceptInvitation as acceptInvitationRow, createInvitation, revokeInvitation,
} from "@buildflow/db/queries/invitations";
import { addActivity, addLocation, listLocations } from "@buildflow/db/queries/reference";
import { audit } from "@buildflow/db/queries/audit";
import { getOrganizationSettings, organizationUsage } from "@buildflow/db/queries/organization";
import { assertEntitled } from "@buildflow/domain/entitlements";

export const LOCATION_KINDS = ["site", "building", "zone", "floor", "room"] as const;

export function parseRole(value: unknown): Role {
  if (typeof value === "string" && (ROLES as readonly string[]).includes(value)) return value as Role;
  throw new Error(`Unknown role: ${String(value)}`);
}

export async function createProjectAsAdmin(
  db: AppDb, ctx: TenantContext, settings: ProjectSettings,
): Promise<string> {
  assertCan(ctx, "org.manage");
  if (!settings.name?.trim()) throw new Error("Project name is required");
  const [organization, usage] = await Promise.all([
    getOrganizationSettings(db, ctx.organizationId), organizationUsage(db, ctx.organizationId),
  ]);
  assertEntitled(organization.plan, organization.billingStatus, usage, "projects");
  const project = await createProject(db, ctx, { ...settings, name: settings.name.trim() });
  await audit(db, ctx, { action: "project.created", subjectRef: project.id, metadata: { name: project.name } });
  return project.id;
}

export async function updateProjectSettings(
  db: AppDb, ctx: TenantContext, projectId: string, settings: Partial<ProjectSettings>,
): Promise<void> {
  assertCan(ctx, "project.manage");
  await updateProject(db, ctx, projectId, settings);
  await audit(db, ctx, { action: "project.settings_updated", subjectRef: projectId, metadata: { fields: Object.keys(settings) } });
}

export async function inviteMember(db: AppDb, ctx: TenantContext, input: {
  email?: string; mobile?: string; role: Role; projectId?: string | null;
}): Promise<{
  token: string;
  expiresAt: Date;
  organizationName: string;
  projectName: string | null;
}> {
  assertCan(ctx, input.projectId ? "project.members.manage" : "org.members.manage");
  const project = input.projectId ? await getProject(db, ctx, input.projectId) : null; // tenant check
  const [organization, usage] = await Promise.all([
    getOrganizationSettings(db, ctx.organizationId), organizationUsage(db, ctx.organizationId),
  ]);
  assertEntitled(organization.plan, organization.billingStatus, usage, "users");
  const invitation = await createInvitation(db, ctx, input);
  await audit(db, ctx, {
    action: "member.invited", subjectRef: invitation.id,
    metadata: { role: input.role, projectId: input.projectId ?? null },
  });
  return {
    token: invitation.token,
    expiresAt: invitation.expiresAt,
    organizationName: organization.name,
    projectName: project?.name ?? null,
  };
}

export async function revokeMemberInvitation(
  db: AppDb, ctx: TenantContext, invitationId: string,
): Promise<void> {
  assertCan(ctx, "org.members.manage");
  await revokeInvitation(db, ctx, invitationId);
  await audit(db, ctx, { action: "member.invitation_revoked", subjectRef: invitationId, metadata: {} });
}

export async function changeMemberRole(db: AppDb, ctx: TenantContext, input: {
  userId: string; projectId: string | null; role: Role;
}): Promise<void> {
  assertCan(ctx, input.projectId ? "project.members.manage" : "org.members.manage");
  await upsertMembership(db, ctx, input);
  await audit(db, ctx, {
    action: "member.role_changed", subjectRef: input.userId,
    metadata: { role: input.role, projectId: input.projectId },
  });
}

export async function acceptInvitationAndCreateAccount(db: AppDb, input: {
  token: string; displayName: string; password: string; email?: string;
}): Promise<{ userId: string; email: string } | null> {
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!input.displayName.trim()) throw new Error("Name is required");
  const accepted = await acceptInvitationRow(db, {
    token: input.token, displayName: input.displayName.trim(),
    password: input.password, email: input.email,
  });
  if (!accepted) return null;
  const systemCtx: TenantContext = {
    organizationId: accepted.organizationId, userId: accepted.userId, capabilities: [],
  };
  await audit(db, systemCtx, { action: "member.invitation_accepted", subjectRef: accepted.userId, metadata: {} });
  return { userId: accepted.userId, email: accepted.email };
}

// CSV import — template: name,kind,parent (parent = name of an earlier row or existing
// location; blank for top level).
export async function importLocationsCsv(
  db: AppDb, ctx: TenantContext, projectId: string, csvText: string,
): Promise<{ imported: number }> {
  assertCan(ctx, "project.manage");
  await getProject(db, ctx, projectId);
  const records = csvRecords(parseCsv(csvText), ["name", "kind"]);
  const existing = await listLocations(db, ctx, projectId);
  const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l.id]));
  let imported = 0;
  for (const [index, record] of records.entries()) {
    const kind = record.kind.toLowerCase();
    if (!(LOCATION_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`Row ${index + 2}: unknown kind "${record.kind}"`);
    }
    if (byName.has(record.name.toLowerCase())) continue; // idempotent re-import
    const parentName = (record.parent ?? "").toLowerCase();
    const parentId = parentName ? byName.get(parentName) : null;
    if (parentName && !parentId) {
      throw new Error(`Row ${index + 2}: parent "${record.parent}" not found (order rows parent-first)`);
    }
    const row = await addLocation(db, ctx, {
      projectId, name: record.name, kind, parentId: parentId ?? null, sortOrder: index,
    });
    byName.set(record.name.toLowerCase(), row.id);
    imported += 1;
  }
  await audit(db, ctx, { action: "project.locations_imported", subjectRef: projectId, metadata: { imported } });
  return { imported };
}

// CSV template: name,unit,location (location by name, optional).
export async function importActivitiesCsv(
  db: AppDb, ctx: TenantContext, projectId: string, csvText: string,
): Promise<{ imported: number }> {
  assertCan(ctx, "project.manage");
  await getProject(db, ctx, projectId);
  const records = csvRecords(parseCsv(csvText), ["name"]);
  const locations = await listLocations(db, ctx, projectId);
  const locationByName = new Map(locations.map((l) => [l.name.toLowerCase(), l.id]));
  let imported = 0;
  for (const [index, record] of records.entries()) {
    const locationName = (record.location ?? "").toLowerCase();
    const locationId = locationName ? locationByName.get(locationName) : null;
    if (locationName && !locationId) {
      throw new Error(`Row ${index + 2}: location "${record.location}" not found`);
    }
    await addActivity(db, ctx, {
      projectId, name: record.name, unit: record.unit || null,
      locationId: locationId ?? null, sortOrder: index,
    });
    imported += 1;
  }
  await audit(db, ctx, { action: "project.activities_imported", subjectRef: projectId, metadata: { imported } });
  return { imported };
}
