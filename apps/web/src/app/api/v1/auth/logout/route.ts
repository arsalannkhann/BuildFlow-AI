import { NextResponse } from "next/server";
import { getDb } from "@buildflow/db/client";
import { getAuth } from "@buildflow/auth/dev";
import { problem } from "@/core/api-auth";

export async function POST(req: Request): Promise<NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return problem(401, "Authentication required");
  await getAuth().signOut(await getDb(), token);
  return NextResponse.json({ ok: true });
}
