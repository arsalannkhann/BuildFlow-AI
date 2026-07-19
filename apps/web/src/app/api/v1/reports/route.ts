import { NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { dailyReports } from "@buildflow/db/schema";
import { createReportRequest } from "@buildflow/contracts/v1";
import { upsertReportManifest, SyncError } from "@/core/sync-core";
import { problem, requireApiAuth } from "@/core/api-auth";
import { tracedRoute } from "@/core/request-security";
import { withTenant } from "@buildflow/db/tenant";

export async function POST(req: Request): Promise<Response> {
  return tracedRoute(req, "POST /api/v1/reports", async () => {
    const json = await req.json().catch(() => null);
    const body = createReportRequest.safeParse(json);
    if (!body.success) return problem(400, "Invalid request", body.error.issues[0]?.message);
    const auth = await requireApiAuth(req, { projectId: body.data.projectId });
    if (auth instanceof NextResponse) return auth;
    const { db, ctx } = auth;
    try {
      const result = await withTenant(db, ctx, (tx) => upsertReportManifest(tx, ctx, body.data));
      const origin = new URL(req.url).origin;
      return NextResponse.json({
        reportId: result.reportId,
        status: result.status,
        attachments: result.attachments.map((a) => ({
          ...a,
          uploadUrl: `${origin}/api/v1/reports/${result.reportId}/attachments/${a.attachmentId}/content`,
        })),
      });
    } catch (err) {
      if (err instanceof SyncError) return problem(err.status, err.message);
      if (err instanceof Error && /not permitted/i.test(err.message)) return problem(403, "Not permitted");
      throw err;
    }
  });
}

export async function GET(req: Request): Promise<Response> {
  return tracedRoute(req, "GET /api/v1/reports", async () => {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const cursor = url.searchParams.get("cursor");
    const auth = await requireApiAuth(req, { projectId });
    if (auth instanceof NextResponse) return auth;
    const { db, ctx } = auth;

    const PAGE = 20;
    const rows = await withTenant(db, ctx, (tx) => tx.select().from(dailyReports)
      .where(and(
        eq(dailyReports.organizationId, ctx.organizationId),
        projectId ? eq(dailyReports.projectId, projectId) : undefined,
        cursor ? lt(dailyReports.id, cursor) : undefined,
      ))
      .orderBy(desc(dailyReports.id))
      .limit(PAGE + 1));

    const page = rows.slice(0, PAGE);
    return NextResponse.json({
      reports: page.map((r) => ({
        id: r.id, projectId: r.projectId, reportDate: r.reportDate, status: r.status,
        note: r.note, createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: rows.length > PAGE ? page[page.length - 1].id : null,
    });
  });
}
