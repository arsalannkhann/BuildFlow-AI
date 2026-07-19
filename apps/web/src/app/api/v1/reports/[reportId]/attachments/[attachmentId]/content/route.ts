import { NextResponse } from "next/server";
import { getStorage } from "@buildflow/storage/factory";
import { storeAttachmentContent, SyncError } from "@/core/sync-core";
import { problem, requireApiAuth } from "@/core/api-auth";
import { rateLimitResponse, tracedRoute } from "@/core/request-security";
import { withTenant } from "@buildflow/db/tenant";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export async function PUT(
  req: Request, { params }: { params: Promise<{ reportId: string; attachmentId: string }> },
): Promise<Response> {
  const { reportId, attachmentId } = await params;
  return tracedRoute(req, "PUT /api/v1/reports/:reportId/attachments/:attachmentId/content", async () => {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES) return problem(413, "Upload too large");
    const auth = await requireApiAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { db, ctx } = auth;
    const limited = await rateLimitResponse(db, req, {
      scope: "upload", key: ctx.userId, limit: 60, windowMs: 60_000,
    });
    if (limited) return limited;
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength === 0) return problem(400, "Empty body");
    if (bytes.byteLength > MAX_UPLOAD_BYTES) return problem(413, "Upload too large");
    try {
      const result = await withTenant(db, ctx, (tx) =>
        storeAttachmentContent(tx, getStorage(), ctx, reportId, attachmentId, bytes));
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof SyncError) return problem(err.status, err.message);
      if (err instanceof Error && /not found/i.test(err.message)) return problem(404, "Not found");
      throw err;
    }
  });
}
