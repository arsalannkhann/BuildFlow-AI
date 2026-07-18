import { NextResponse } from "next/server";
import { finalizeReport, SyncError } from "@/core/sync-core";
import { problem, requireApiAuth } from "@/core/api-auth";

export async function POST(
  req: Request, { params }: { params: Promise<{ reportId: string }> },
): Promise<NextResponse> {
  const { reportId } = await params;
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { db, ctx } = auth;
  try {
    // Membership for the report's project is re-resolved inside via tenant-scoped reads;
    // finalize itself is idempotent.
    const result = await finalizeReport(db, ctx, reportId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SyncError) return problem(err.status, err.message);
    if (err instanceof Error && /not found/i.test(err.message)) return problem(404, "Report not found");
    throw err;
  }
}
