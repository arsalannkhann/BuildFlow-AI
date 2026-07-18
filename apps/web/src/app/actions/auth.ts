"use server";
import { redirect } from "next/navigation";
import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { getAuth } from "@buildflow/auth/dev";
import { DEMO_PASSWORD, SEED } from "@buildflow/db/seed";
import { SESSION_COOKIE } from "@/app/session";

// One-click demo sign-in goes through the same credentialed path as the form; it is only
// available while the seeded demo org is enabled (default outside production).
const quickLoginEnabled = () =>
  process.env.DEMO_QUICK_LOGIN === "1" || process.env.NODE_ENV !== "production";

const PRESETS: Record<string, { email: string; password: string }> = {
  engineer: { email: SEED.engineer.email, password: DEMO_PASSWORD },
  manager: { email: SEED.manager.email, password: DEMO_PASSWORD },
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
  const result = await getAuth().signInWithPassword(db, email, password);
  if (!result) redirect("/login?error=invalid");

  const { cookies } = await import("next/headers");
  (await cookies()).set(SESSION_COOKIE, result.token, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: result.expiresAt,
  });
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
