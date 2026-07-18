import { NextResponse } from "next/server";
import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { getAuth } from "@buildflow/auth/dev";
import { loginRequest } from "@buildflow/contracts/v1";
import { problem } from "@/core/api-auth";

export async function POST(req: Request): Promise<NextResponse> {
  await ensureBooted();
  const body = loginRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return problem(400, "Invalid request", "email and password are required");
  const db = await getDb();
  const result = await getAuth().signInWithPassword(db, body.data.email, body.data.password);
  if (!result) return problem(401, "Invalid credentials");
  return NextResponse.json({
    token: result.token, userId: result.userId, expiresAt: result.expiresAt.toISOString(),
  });
}
