import { NextResponse } from "next/server";
import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { getAuth } from "@buildflow/auth/dev";
import { resolveTenantContext } from "@buildflow/auth/context";
import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { newId } from "@buildflow/domain/ids";

// RFC 9457 Problem Details envelope; traceId lets support correlate without content access.
export function problem(status: number, title: string, detail?: string): NextResponse {
  return NextResponse.json(
    { type: "about:blank", title, status, detail, traceId: newId() },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

export type ApiAuth = { db: AppDb; ctx: TenantContext; userId: string };

/** Resolves Bearer-token auth for /v1 routes; returns a Problem response on failure. */
export async function requireApiAuth(
  req: Request, opts?: { projectId?: string },
): Promise<ApiAuth | NextResponse> {
  await ensureBooted();
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return problem(401, "Authentication required");
  const db = await getDb();
  const session = await getAuth().verifySession(db, token);
  if (!session) return problem(401, "Session invalid or expired");
  try {
    const ctx = await resolveTenantContext(db, session.userId, opts?.projectId);
    return { db, ctx, userId: session.userId };
  } catch {
    return problem(403, "No active membership");
  }
}
