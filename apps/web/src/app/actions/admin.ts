"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
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
import { sendInvitationEmail } from "@buildflow/notify/invitation";
import type { Role } from "@buildflow/domain/tenancy";

const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();
const opt = (fd: FormData, key: string): string | null => str(fd, key) || null;

type InvitationDelivery = "sent" | "failed" | "not-requested";

function invitationBaseUrl(requestHeaders: Pick<Headers, "get">): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("APP_BASE_URL is required to email invitation links in production");
  }
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost ?? requestHeaders.get("host")?.trim() ?? "localhost:3000";
  const candidate = configured || `${forwardedProto === "https" ? "https" : "http"}://${host}`;
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use http or https");
  }
  if (url.username || url.password) throw new Error("APP_BASE_URL must not include credentials");
  return url.toString().replace(/\/+$/, "");
}

async function deliverInvitation(input: {
  email: string | null;
  token: string;
  expiresAt: Date;
  organizationName: string;
  projectName: string | null;
  role: Role;
}): Promise<InvitationDelivery> {
  if (!input.email) return "not-requested";
  try {
    const requestHeaders = await headers();
    const inviteUrl = `${invitationBaseUrl(requestHeaders)}/invite/${encodeURIComponent(input.token)}`;
    await sendInvitationEmail({
      to: input.email,
      inviteUrl,
      organizationName: input.organizationName,
      projectName: input.projectName,
      role: input.role,
      expiresAt: input.expiresAt,
    });
    return "sent";
  } catch {
    // The valid link is still shown once in the redirect UI. Never log its token or recipient.
    console.error("invitation email dispatch failed");
    return "failed";
  }
}

function invitationRedirect(back: string, token: string, delivery: InvitationDelivery): never {
  const query = new URLSearchParams({ invited: token, delivery });
  redirect(`${back}?${query}`);
}

export async function createProjectAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  const projectId = await withTenant(db, ctx, (tx) => createProjectAsAdmin(tx, ctx, {
    name: str(formData, "name"),
    clientName: opt(formData, "clientName"),
    timezone: str(formData, "timezone") || "Asia/Kolkata",
    address: opt(formData, "address"),
  }));
  redirect(`/projects/${projectId}/admin`);
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = str(formData, "projectId");
  const ctx = await currentContext();
  const lat = opt(formData, "latitude");
  const lng = opt(formData, "longitude");
  const scoped = { ...ctx, projectId };
  await withTenant(db, scoped, (tx) => updateProjectSettings(tx, scoped, projectId, {
    name: str(formData, "name"),
    clientName: opt(formData, "clientName"),
    timezone: str(formData, "timezone") || "Asia/Kolkata",
    address: opt(formData, "address"),
    reportCutoff: opt(formData, "reportCutoff"),
    latitude: lat === null ? null : Number(lat),
    longitude: lng === null ? null : Number(lng),
    defaultRecipients: opt(formData, "defaultRecipients")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null,
  }));
  revalidatePath(`/projects/${projectId}/admin`);
}

export async function inviteMemberAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = opt(formData, "projectId");
  const email = opt(formData, "email");
  const role = parseRole(str(formData, "role"));
  const ctx = await currentContext();
  const scoped = projectId ? { ...ctx, projectId } : ctx;
  const invite = await withTenant(db, scoped, (tx) => inviteMember(tx, scoped, {
    email: email ?? undefined,
    mobile: opt(formData, "mobile") ?? undefined,
    role,
    projectId,
  }));
  const delivery = await deliverInvitation({ email, role, ...invite });
  const back = projectId ? `/projects/${projectId}/admin` : "/organization";
  invitationRedirect(back, invite.token, delivery);
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await withTenant(db, ctx, (tx) => revokeMemberInvitation(tx, ctx, str(formData, "invitationId")));
  revalidatePath("/organization");
  const projectId = opt(formData, "projectId");
  if (projectId) revalidatePath(`/projects/${projectId}/admin`);
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = opt(formData, "projectId");
  const ctx = await currentContext();
  const scoped = projectId ? { ...ctx, projectId } : ctx;
  await withTenant(db, scoped, (tx) => changeMemberRole(tx, scoped, {
    userId: str(formData, "userId"),
    projectId,
    role: parseRole(str(formData, "role")),
  }));
  if (projectId) revalidatePath(`/projects/${projectId}/admin`);
  revalidatePath("/organization");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = opt(formData, "projectId");
  const ctx = await currentContext();
  assertCan(ctx, projectId ? "project.members.manage" : "org.members.manage");
  const membershipId = str(formData, "membershipId");
  await withTenant(db, ctx, async (tx) => {
    await removeMembership(tx, ctx, membershipId);
    await audit(tx, ctx, { action: "member.removed", subjectRef: membershipId, metadata: { projectId } });
  });
  if (projectId) revalidatePath(`/projects/${projectId}/admin`);
  revalidatePath("/organization");
}

export async function addLocationAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = str(formData, "projectId");
  const ctx = await currentContext();
  assertCan(ctx, "project.manage");
  const scoped = { ...ctx, projectId };
  await withTenant(db, scoped, (tx) => addLocation(tx, scoped, {
    projectId, name: str(formData, "name"), kind: str(formData, "kind"),
    parentId: opt(formData, "parentId"),
  }));
  revalidatePath(`/projects/${projectId}/admin`);
}

export async function addActivityAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const projectId = str(formData, "projectId");
  const ctx = await currentContext();
  assertCan(ctx, "project.manage");
  const scoped = { ...ctx, projectId };
  await withTenant(db, scoped, (tx) => addActivity(tx, scoped, {
    projectId, name: str(formData, "name"), unit: opt(formData, "unit"),
    locationId: opt(formData, "locationId"),
  }));
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
  if (kind === "locations") await withTenant(db, scoped, (tx) => importLocationsCsv(tx, scoped, projectId, text));
  else if (kind === "activities") await withTenant(db, scoped, (tx) => importActivitiesCsv(tx, scoped, projectId, text));
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
  let accepted: Awaited<ReturnType<typeof acceptInvitationAndCreateAccount>>;
  try {
    accepted = await acceptInvitationAndCreateAccount(db, {
      token,
      displayName: str(formData, "displayName"),
      password,
      email: opt(formData, "email") ?? undefined,
    });
  } catch (error) {
    // An email can own only one account across the whole platform (user_email_unique). If the
    // invitee already has one, creating a second violates the constraint — surface that as a
    // "sign in instead" prompt on the invite page rather than an unhandled 500 (digest error).
    if (error instanceof Error && /unique|duplicate|conflict|23505/i.test(error.message)) {
      redirect(`/invite/${encodeURIComponent(token)}?error=email_taken`);
    }
    throw error;
  }
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
  await withTenant(db, ctx, async (tx) => {
    await updateOrganizationCommercialSettings(tx, ctx, {
      plan: parsePlan(str(formData, "plan")),
      billingStatus: parseBillingStatus(str(formData, "billingStatus")), retentionDays,
    });
    await audit(tx, ctx, {
      action: "organization.settings_updated", subjectRef: ctx.organizationId,
      metadata: { fields: ["plan", "billingStatus", "retentionDays"] },
    });
  });
  revalidatePath("/organization");
}

export async function requestOrganizationExportAction(): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await withTenant(db, ctx, (tx) => createOrganizationExportRequest(tx, ctx));
  revalidatePath("/organization");
}

export async function requestOrganizationDeletionAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  const organization = await withTenant(db, ctx, (tx) => getOrganizationSettings(tx, ctx.organizationId));
  if (str(formData, "organizationName") !== organization.name) {
    throw new Error("Enter the organization name exactly to request deletion");
  }
  await withTenant(db, ctx, (tx) => requestOrganizationDeletion(tx, ctx));
  revalidatePath("/organization");
}

export async function approveOrganizationDeletionAction(): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await withTenant(db, ctx, (tx) => approveOrganizationDeletion(tx, ctx));
  revalidatePath("/organization");
}

export async function cancelOrganizationDeletionAction(): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await withTenant(db, ctx, (tx) => cancelOrganizationDeletion(tx, ctx));
  revalidatePath("/organization");
}

export async function createOnboardingProjectAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await withTenant(db, ctx, (tx) => createProjectAsAdmin(tx, ctx, {
    name: str(formData, "name"), clientName: opt(formData, "clientName"),
    timezone: str(formData, "timezone") || "Asia/Kolkata", address: opt(formData, "address"),
  }));
  redirect("/onboarding?project=created");
}

export async function inviteOnboardingMemberAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const email = opt(formData, "email");
  const role = parseRole(str(formData, "role"));
  const ctx = await currentContext();
  const invite = await withTenant(db, ctx, (tx) => inviteMember(tx, ctx, {
    email: email ?? undefined, role, projectId: null,
  }));
  const delivery = await deliverInvitation({ email, role, ...invite });
  invitationRedirect("/onboarding", invite.token, delivery);
}
