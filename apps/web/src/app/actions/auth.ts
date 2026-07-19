"use server";
import { redirect } from "next/navigation";
import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { getAuth } from "@buildflow/auth/dev";
import { DEMO_PASSWORD, SEED } from "@buildflow/db/seed";
import { SESSION_COOKIE } from "@/app/session";
import { consumeRateLimit } from "@buildflow/db/queries/rate-limits";
import { headers } from "next/headers";
import { resolveTenantContext } from "@buildflow/auth/context";
import { listProjects } from "@buildflow/db/queries/projects";
import { listMembers } from "@buildflow/db/queries/members";
import { registerOrganizationOwner } from "@/core/registration-core";

// One-click demo sign-in goes through the same credentialed path as the form; it is only
// available while the seeded demo org is enabled (default outside production).
const quickLoginEnabled = () =>
  process.env.DEMO_QUICK_LOGIN === "1" || process.env.NODE_ENV !== "production";

const PRESETS: Record<string, { email: string; password: string }> = {
  engineer: { email: SEED.engineer.email, password: DEMO_PASSWORD },
  manager: { email: SEED.manager.email, password: DEMO_PASSWORD },
  owner: { email: SEED.owner.email, password: DEMO_PASSWORD },
};

export async function loginAction(formData: FormData): Promise<void> {
  await ensureBooted();
  const preset = formData.get("preset");
  let email = String(formData.get("email") ?? "");
  let password = String(formData.get("password") ?? "");
  if (typeof preset === "string" && preset in PRESETS && quickLoginEnabled()) {
    ({ email, password } = PRESETS[preset]);
  }
  if (!email || !password) redirect("/login?error=missing");

  const db = await getDb();
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = await consumeRateLimit(db, {
    scope: "web-login", key: `${ip}:${email.trim().toLowerCase()}`,
    limit: 10, windowMs: 15 * 60_000,
  });
  if (!limit.allowed) redirect("/login?error=limited");
  const result = await getAuth().signInWithPassword(db, email, password);
  if (!result) redirect("/login?error=invalid");

  const { cookies } = await import("next/headers");
  (await cookies()).set(SESSION_COOKIE, result.token, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: result.expiresAt,
  });
  const ctx = await resolveTenantContext(db, result.userId);
  if (ctx.capabilities.includes("org.manage")) {
    const [projects, members] = await Promise.all([listProjects(db, ctx), listMembers(db, ctx)]);
    if (projects.length === 0 || members.length <= 1) redirect("/onboarding");
  }
  redirect("/reports");
}

export async function logoutAction(): Promise<void> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await getAuth().signOut(await getDb(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function registerOrganizationAction(formData: FormData): Promise<void> {
  if (process.env.SIGNUPS_ENABLED !== "1") redirect("/login");
  await ensureBooted();
  const db = await getDb();
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = await consumeRateLimit(db, {
    scope: "organization-registration", key: ip, limit: 5, windowMs: 60 * 60_000,
  });
  if (!limit.allowed) redirect("/signup?error=limited");

  let registration: Awaited<ReturnType<typeof registerOrganizationOwner>>;
  try {
    registration = await registerOrganizationOwner(db, {
      organizationName: String(formData.get("organizationName") ?? ""),
      ownerName: String(formData.get("ownerName") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
  } catch (error) {
    if (error instanceof Error && /conflict|unique|duplicate/i.test(error.message)) {
      redirect("/signup?error=conflict");
    }
    redirect("/signup?error=invalid");
  }
  const result = await getAuth().signInWithPassword(
    db, registration.email, String(formData.get("password") ?? ""),
  );
  if (!result) redirect("/signup?error=invalid");
  const { cookies } = await import("next/headers");
  (await cookies()).set(SESSION_COOKIE, result.token, {
    httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production",
    expires: result.expiresAt,
  });
  redirect("/onboarding");
}

// --- Password reset and change (self-serve + admin-generated links) ---

export type SignupFormState = {
  error: string | null;
  organizationName: string;
  ownerName: string;
  email: string;
};

// useActionState variant of registration: returns WHICH rule failed and preserves the
// typed values (never the password) instead of wiping the form (design.md §14).
export async function registerOrganizationFormAction(
  _prev: SignupFormState, formData: FormData,
): Promise<SignupFormState> {
  const values = {
    organizationName: String(formData.get("organizationName") ?? "").trim(),
    ownerName: String(formData.get("ownerName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
  };
  if (process.env.SIGNUPS_ENABLED !== "1") redirect("/login");
  await ensureBooted();
  const db = await getDb();
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = await consumeRateLimit(db, {
    scope: "organization-registration", key: ip, limit: 5, windowMs: 60 * 60_000,
  });
  if (!limit.allowed) return { ...values, error: "limited" };

  const password = String(formData.get("password") ?? "");
  let registered: Awaited<ReturnType<typeof registerOrganizationOwner>>;
  try {
    registered = await registerOrganizationOwner(db, { ...values, password });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = /conflict|unique|duplicate/i.test(message) ? "conflict"
      : /organization name/i.test(message) ? "org_name"
      : /owner name/i.test(message) ? "owner_name"
      : /valid email/i.test(message) ? "email"
      : /12 characters/i.test(message) ? "password"
      : "invalid";
    return { ...values, error: code };
  }
  const result = await getAuth().signInWithPassword(db, registered.email, password);
  if (!result) redirect("/login?registered=1"); // account exists; sign in normally
  const { cookies } = await import("next/headers");
  (await cookies()).set(SESSION_COOKIE, result.token, {
    httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production",
    expires: result.expiresAt,
  });
  redirect("/onboarding");
}

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  await ensureBooted();
  const db = await getDb();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // The response is identical in every branch (enumeration-safe); throttled requests
  // simply skip the send.
  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit(db, { scope: "password-reset-ip", key: ip, limit: 5, windowMs: 60 * 60_000 }),
    consumeRateLimit(db, { scope: "password-reset-email", key: email || "empty", limit: 3, windowMs: 60 * 60_000 }),
  ]);
  if (email && byIp.allowed && byEmail.allowed) {
    const { createPasswordReset } = await import("@buildflow/auth/reset");
    const reset = await createPasswordReset(db, email);
    if (reset) {
      const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
      const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
      try {
        const { getNotifyRegistry } = await import("@buildflow/notify/registry");
        const { renderBrandedEmail } = await import("@buildflow/notify/template");
        const resetUrl = `${proto}://${host}/reset/${reset.token}`;
        await getNotifyRegistry().email.send({
          to: email,
          subject: "Reset your BuildFlow password",
          text: [
            "Someone requested a password reset for your BuildFlow account.",
            "",
            `Reset link (valid for 30 minutes, single use): ${resetUrl}`,
            "",
            "If you did not request this, you can ignore this email; your password is unchanged.",
          ].join("\n"),
          html: renderBrandedEmail({
            previewText: "Set a new BuildFlow password — link valid for 30 minutes.",
            title: "Reset your BuildFlow password",
            body: "Someone requested a password reset for your account. Use the button below to choose a new password. All signed-in devices are signed out after the change.",
            ctaUrl: resetUrl,
            ctaLabel: "Set a new password",
            validityNote: "This link works once and expires in 30 minutes. If you did not request it, ignore this email; your password is unchanged.",
          }),
        });
      } catch {
        console.error("password-reset email dispatch failed"); // no address/token in logs
      }
    }
  }
  redirect("/forgot?sent=1");
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  await ensureBooted();
  const db = await getDb();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const back = `/reset/${encodeURIComponent(token)}`;
  if (!token) redirect("/forgot");
  if (password !== confirm) redirect(`${back}?error=mismatch`);
  try {
    const { consumePasswordReset } = await import("@buildflow/auth/reset");
    await consumePasswordReset(db, token, password);
  } catch (error) {
    const { ResetError } = await import("@buildflow/auth/reset");
    if (error instanceof ResetError && error.code === "weak_password") redirect(`${back}?error=weak`);
    redirect(`${back}?error=invalid`);
  }
  redirect("/login?reset=1");
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  await ensureBooted();
  const db = await getDb();
  const { currentContext } = await import("@/app/session");
  const ctx = await currentContext();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next !== confirm) redirect("/account?pw=mismatch");
  const { cookies } = await import("next/headers");
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  try {
    const { changePassword } = await import("@buildflow/auth/reset");
    await changePassword(db, ctx.userId, current, next, sessionToken);
  } catch (error) {
    const { ResetError } = await import("@buildflow/auth/reset");
    if (error instanceof ResetError && error.code === "weak_password") redirect("/account?pw=weak");
    redirect("/account?pw=wrong");
  }
  redirect("/account?pw=changed");
}

// Admin path for locked-out members: a member-manager generates a single-use reset link
// and hands it over on any channel. Same token mechanics as self-serve.
export async function generateMemberResetLinkAction(formData: FormData): Promise<void> {
  await ensureBooted();
  const db = await getDb();
  const { currentContext } = await import("@/app/session");
  const ctx = await currentContext();
  const { assertCan } = await import("@buildflow/domain/tenancy");
  assertCan(ctx, "org.members.manage");
  const targetUserId = String(formData.get("userId") ?? "");
  const { users } = await import("@buildflow/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const [target] = await db.select().from(users).where(and(
    eq(users.id, targetUserId), eq(users.organizationId, ctx.organizationId),
  ));
  if (!target) redirect("/organization");
  const { createPasswordResetForUser } = await import("@buildflow/auth/reset");
  const reset = await createPasswordResetForUser(db, target.id);
  const { audit } = await import("@buildflow/db/queries/audit");
  await audit(db, ctx, {
    action: "member.password_reset_link_generated", subjectRef: target.id, metadata: {},
  });
  redirect(`/organization?resetToken=${encodeURIComponent(reset.token)}`);
}
