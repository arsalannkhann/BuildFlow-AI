import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { getAuth } from "@buildflow/auth/dev";
import { resolveTenantContext } from "@buildflow/auth/context";
import type { TenantContext } from "@buildflow/domain/tenancy";

export const SESSION_COOKIE = "bf_session";

/** Resolves the signed-in user's TenantContext or redirects to /login. */
export async function currentContext(): Promise<TenantContext> {
  // Read request state before opening PGlite. Besides being cheaper for unauthenticated
  // requests, this tells Next the caller is dynamic before a production build considers
  // prerendering it (the PGlite pgvector bundle is a runtime asset, not a build-time one).
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  await ensureBooted();
  const db = await getDb();
  const sessionUser = await getAuth().verifySession(db, token);
  if (!sessionUser) redirect("/login");
  return resolveTenantContext(db, sessionUser.userId);
}
