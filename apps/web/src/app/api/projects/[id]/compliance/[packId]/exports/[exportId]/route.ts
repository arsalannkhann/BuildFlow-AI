import { getDb } from "@buildflow/db/client";
import { resolveTenantContext } from "@buildflow/auth/context";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { currentContext } from "@/app/session";
import { complianceExportForDownload } from "@/core/compliance-core";

export async function GET(_request: Request, { params }: {
  params: Promise<{ id: string; packId: string; exportId: string }>;
}) {
  const { id, packId, exportId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = await resolveTenantContext(db, base.userId, id);
  try {
    const row = await complianceExportForDownload(db, ctx, id, packId, exportId);
    const bytes = await new LocalFsStorage().get(row.objectKey);
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="buildflow-compliance-v${row.version}.zip"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
