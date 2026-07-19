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
