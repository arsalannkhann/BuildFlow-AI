import { NextResponse } from "next/server";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { storeAttachmentContent, SyncError } from "@/core/sync-core";
import { problem, requireApiAuth } from "@/core/api-auth";

export async function PUT(
  req: Request, { params }: { params: Promise<{ reportId: string; attachmentId: string }> },
): Promise<NextResponse> {
  const { reportId, attachmentId } = await params;
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { db, ctx } = auth;
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) return problem(400, "Empty body");
  try {
    const result = await storeAttachmentContent(db, new LocalFsStorage(), ctx, reportId, attachmentId, bytes);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SyncError) return problem(err.status, err.message);
    if (err instanceof Error && /not found/i.test(err.message)) return problem(404, "Not found");
    throw err;
  }
}
