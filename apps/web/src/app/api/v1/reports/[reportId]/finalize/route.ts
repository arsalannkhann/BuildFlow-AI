import { NextResponse } from "next/server";
import { finalizeReport, SyncError } from "@/core/sync-core";
import { problem, requireApiAuth } from "@/core/api-auth";
import { tracedRoute } from "@/core/request-security";
import { withTenant } from "@buildflow/db/tenant";

export async function POST(
  req: Request, { params }: { params: Promise<{ reportId: string }> },
): Promise<Response> {
  const { reportId } = await params;
  return tracedRoute(req, "POST /api/v1/reports/:reportId/finalize", async () => {
    const auth = await requireApiAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { db, ctx } = auth;
    try {
      // Membership for the report's project is re-resolved inside via tenant-scoped reads;
      // finalize itself is idempotent.
      const result = await withTenant(db, ctx, (tx) => finalizeReport(tx, ctx, reportId));
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof SyncError) return problem(err.status, err.message);
      if (err instanceof Error && /not found/i.test(err.message)) return problem(404, "Report not found");
      throw err;
    }
  });
}
