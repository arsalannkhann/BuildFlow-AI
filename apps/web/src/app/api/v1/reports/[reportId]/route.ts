import { NextResponse } from "next/server";
import { getReport } from "@buildflow/db/queries/reports";
import { latestRevision } from "@buildflow/db/queries/revisions";
import { problem, requireApiAuth } from "@/core/api-auth";
import { tracedRoute } from "@/core/request-security";
import { withTenant } from "@buildflow/db/tenant";

export async function GET(
  req: Request, { params }: { params: Promise<{ reportId: string }> },
): Promise<Response> {
  const { reportId } = await params;
  return tracedRoute(req, "GET /api/v1/reports/:reportId", async () => {
    const auth = await requireApiAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { db, ctx } = auth;
    try {
      const { report, revision } = await withTenant(db, ctx, async (tx) => ({
        report: await getReport(tx, ctx, reportId),
        revision: await latestRevision(tx, ctx, reportId),
      }));
      return NextResponse.json({
        id: report.id, projectId: report.projectId, reportDate: report.reportDate,
        status: report.status, note: report.note, createdAt: report.createdAt.toISOString(),
        summaryInternal: revision?.summaryInternal ?? null,
      });
    } catch {
      return problem(404, "Report not found");
    }
  });
}
