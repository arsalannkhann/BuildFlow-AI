import { NextResponse } from "next/server";
import { getReport } from "@buildflow/db/queries/reports";
import { latestRevision } from "@buildflow/db/queries/revisions";
import { problem, requireApiAuth } from "@/core/api-auth";

export async function GET(
  req: Request, { params }: { params: Promise<{ reportId: string }> },
): Promise<NextResponse> {
  const { reportId } = await params;
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { db, ctx } = auth;
  try {
    const report = await getReport(db, ctx, reportId);
    const revision = await latestRevision(db, ctx, reportId);
    return NextResponse.json({
      id: report.id, projectId: report.projectId, reportDate: report.reportDate,
      status: report.status, note: report.note, createdAt: report.createdAt.toISOString(),
      summaryInternal: revision?.summaryInternal ?? null,
    });
  } catch {
    return problem(404, "Report not found");
  }
}
