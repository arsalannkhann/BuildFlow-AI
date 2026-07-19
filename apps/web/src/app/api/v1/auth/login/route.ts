import { NextResponse } from "next/server";
import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { getAuth } from "@buildflow/auth/dev";
import { loginRequest } from "@buildflow/contracts/v1";
import { problem } from "@/core/api-auth";
import { rateLimitResponse, requestIp, tracedRoute } from "@/core/request-security";

export async function POST(req: Request): Promise<Response> {
  return tracedRoute(req, "POST /api/v1/auth/login", async () => {
    await ensureBooted();
    const body = loginRequest.safeParse(await req.json().catch(() => null));
    if (!body.success) return problem(400, "Invalid request", "email and password are required");
    const db = await getDb();
    const key = `${requestIp(req)}:${body.data.email.trim().toLowerCase()}`;
    const limited = await rateLimitResponse(db, req, { scope: "login", key, limit: 10, windowMs: 15 * 60_000 });
    if (limited) return limited;
    const result = await getAuth().signInWithPassword(db, body.data.email, body.data.password);
    if (!result) return problem(401, "Invalid credentials");
    return NextResponse.json({
      token: result.token, userId: result.userId, expiresAt: result.expiresAt.toISOString(),
    });
  });
}
