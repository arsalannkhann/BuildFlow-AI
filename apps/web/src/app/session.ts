import { redirect } from "next/navigation";
import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { getAuth } from "@buildflow/auth/dev";
import { resolveTenantContext } from "@buildflow/auth/context";
import type { TenantContext } from "@buildflow/domain/tenancy";

export const SESSION_COOKIE = "bf_session";

/** Resolves the signed-in user's TenantContext or redirects to /login. */
export async function currentContext(): Promise<TenantContext> {
  await ensureBooted();
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  const db = await getDb();
  const sessionUser = await getAuth().verifySession(db, token);
  if (!sessionUser) redirect("/login");
  return resolveTenantContext(db, sessionUser.userId);
}
