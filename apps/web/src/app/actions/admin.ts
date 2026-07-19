"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { getAuth } from "@buildflow/auth/dev";
import { currentContext, SESSION_COOKIE } from "@/app/session";
import {
  acceptInvitationAndCreateAccount, changeMemberRole, createProjectAsAdmin,
  importActivitiesCsv, importLocationsCsv, inviteMember, parseRole,
  revokeMemberInvitation, updateProjectSettings,
} from "@/core/admin-core";
import { addActivity, addLocation } from "@buildflow/db/queries/reference";
import { removeMembership } from "@buildflow/db/queries/members";
import { assertCan } from "@buildflow/domain/tenancy";
import { audit } from "@buildflow/db/queries/audit";
import { consumeRateLimit } from "@buildflow/db/queries/rate-limits";
import { headers } from "next/headers";
import { parseBillingStatus, parsePlan } from "@buildflow/domain/entitlements";
import { getOrganizationSettings, updateOrganizationCommercialSettings } from "@buildflow/db/queries/organization";
import { createOrganizationExportRequest } from "@buildflow/lifecycle/export";
import {
  approveOrganizationDeletion, cancelOrganizationDeletion, requestOrganizationDeletion,
} from "@buildflow/lifecycle/deletion";

const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();
const opt = (fd: FormData, key: string): string | null => str(fd, key) || null;

export async function createProjectAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  const projectId = await createProjectAsAdmin(db, ctx, {
    name: str(formData, "name"),
    clientName: opt(formData, "clientName"),
    timezone: str(formData, "timezone") || "Asia/Kolkata",
    address: opt(formData, "address"),
  });
  redirect(`/projects/${projectId}/admin`);
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = str(formData, "projectId");
  const ctx = await currentContext();
  const lat = opt(formData, "latitude");
  const lng = opt(formData, "longitude");
  await updateProjectSettings(db, { ...ctx, projectId }, projectId, {
    name: str(formData, "name"),
    clientName: opt(formData, "clientName"),
    timezone: str(formData, "timezone") || "Asia/Kolkata",
    address: opt(formData, "address"),
    reportCutoff: opt(formData, "reportCutoff"),
    latitude: lat === null ? null : Number(lat),
    longitude: lng === null ? null : Number(lng),
    defaultRecipients: opt(formData, "defaultRecipients")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null,
  });
  revalidatePath(`/projects/${projectId}/admin`);
}

export async function inviteMemberAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = opt(formData, "projectId");
  const ctx = await currentContext();
  const invite = await inviteMember(db, projectId ? { ...ctx, projectId } : ctx, {
    email: opt(formData, "email") ?? undefined,
    mobile: opt(formData, "mobile") ?? undefined,
    role: parseRole(str(formData, "role")),
    projectId,
  });
  const back = projectId ? `/projects/${projectId}/admin` : "/organization";
  redirect(`${back}?invited=${encodeURIComponent(invite.token)}`);
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await revokeMemberInvitation(db, ctx, str(formData, "invitationId"));
  revalidatePath("/organization");
  const projectId = opt(formData, "projectId");
  if (projectId) revalidatePath(`/projects/${projectId}/admin`);
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = opt(formData, "projectId");
  const ctx = await currentContext();
  await changeMemberRole(db, projectId ? { ...ctx, projectId } : ctx, {
    userId: str(formData, "userId"),
    projectId,
    role: parseRole(str(formData, "role")),
  });
  if (projectId) revalidatePath(`/projects/${projectId}/admin`);
  revalidatePath("/organization");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = opt(formData, "projectId");
  const ctx = await currentContext();
  assertCan(ctx, projectId ? "project.members.manage" : "org.members.manage");
  const membershipId = str(formData, "membershipId");
  await removeMembership(db, ctx, membershipId);
  await audit(db, ctx, { action: "member.removed", subjectRef: membershipId, metadata: { projectId } });
  if (projectId) revalidatePath(`/projects/${projectId}/admin`);
  revalidatePath("/organization");
}

export async function addLocationAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = str(formData, "projectId");
  const ctx = await currentContext();
  assertCan(ctx, "project.manage");
  await addLocation(db, { ...ctx, projectId }, {
    projectId, name: str(formData, "name"), kind: str(formData, "kind"),
    parentId: opt(formData, "parentId"),
  });
  revalidatePath(`/projects/${projectId}/admin`);
}

export async function addActivityAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = str(formData, "projectId");
  const ctx = await currentContext();
  assertCan(ctx, "project.manage");
  await addActivity(db, { ...ctx, projectId }, {
    projectId, name: str(formData, "name"), unit: opt(formData, "unit"),
    locationId: opt(formData, "locationId"),
  });
  revalidatePath(`/projects/${projectId}/admin`);
}

export async function importCsvAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = str(formData, "projectId");
  const kind = str(formData, "kind"); // locations | activities
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Choose a CSV file");
  if (file.size > 1024 * 1024) throw new Error("CSV too large (max 1 MB)");
  const text = await file.text();
  const ctx = await currentContext();
  const scoped = { ...ctx, projectId };
  if (kind === "locations") await importLocationsCsv(db, scoped, projectId, text);
  else if (kind === "activities") await importActivitiesCsv(db, scoped, projectId, text);
  else throw new Error(`Unknown import kind: ${kind}`);
  revalidatePath(`/projects/${projectId}/admin`);
}

export async function acceptInviteAction(formData: FormData): Promise<void> {
  await ensureBooted();
  const db = await getDb();
  const token = str(formData, "token");
  const password = String(formData.get("password") ?? "");
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = await consumeRateLimit(db, {
    scope: "invite-accept", key: `${ip}:${token}`, limit: 20, windowMs: 15 * 60_000,
  });
  if (!limit.allowed) redirect(`/invite/${encodeURIComponent(token)}?error=limited`);
  const accepted = await acceptInvitationAndCreateAccount(db, {
    token,
    displayName: str(formData, "displayName"),
    password,
    email: opt(formData, "email") ?? undefined,
  });
  if (!accepted) redirect("/invite/invalid");
  const signedIn = await getAuth().signInWithPassword(db, accepted.email, password);
  if (signedIn) {
    const { cookies } = await import("next/headers");
    (await cookies()).set(SESSION_COOKIE, signedIn.token, {
      httpOnly: true, sameSite: "lax", path: "/",
      secure: process.env.NODE_ENV === "production",
      expires: signedIn.expiresAt,
    });
  }
  redirect("/reports");
}

export async function updateOrganizationSettingsAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  assertCan(ctx, "org.manage");
  const retentionText = str(formData, "retentionDays");
  const retentionDays = retentionText ? Number(retentionText) : null;
  if (retentionDays !== null && (!Number.isInteger(retentionDays) || retentionDays < 30 || retentionDays > 3_650)) {
    throw new Error("Retention must be between 30 days and 10 years");
  }
  await updateOrganizationCommercialSettings(db, ctx, {
    plan: parsePlan(str(formData, "plan")),
    billingStatus: parseBillingStatus(str(formData, "billingStatus")), retentionDays,
  });
  await audit(db, ctx, {
    action: "organization.settings_updated", subjectRef: ctx.organizationId,
    metadata: { fields: ["plan", "billingStatus", "retentionDays"] },
  });
  revalidatePath("/organization");
}

export async function requestOrganizationExportAction(): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await createOrganizationExportRequest(db, ctx);
  revalidatePath("/organization");
}

export async function requestOrganizationDeletionAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  const organization = await getOrganizationSettings(db, ctx.organizationId);
  if (str(formData, "organizationName") !== organization.name) {
    throw new Error("Enter the organization name exactly to request deletion");
  }
  await requestOrganizationDeletion(db, ctx);
  revalidatePath("/organization");
}

export async function approveOrganizationDeletionAction(): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await approveOrganizationDeletion(db, ctx);
  revalidatePath("/organization");
}

export async function cancelOrganizationDeletionAction(): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await cancelOrganizationDeletion(db, ctx);
  revalidatePath("/organization");
}

export async function createOnboardingProjectAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await createProjectAsAdmin(db, ctx, {
    name: str(formData, "name"), clientName: opt(formData, "clientName"),
    timezone: str(formData, "timezone") || "Asia/Kolkata", address: opt(formData, "address"),
  });
  redirect("/onboarding?project=created");
}

export async function inviteOnboardingMemberAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  const invite = await inviteMember(db, ctx, {
    email: opt(formData, "email") ?? undefined,
    role: parseRole(str(formData, "role")), projectId: null,
  });
  redirect(`/onboarding?invited=${encodeURIComponent(invite.token)}`);
}
