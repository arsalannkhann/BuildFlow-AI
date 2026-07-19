import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { resolveTenantContext } from "@buildflow/auth/context";
import { getStorage } from "@buildflow/storage/factory";
import { currentContext } from "@/app/session";
import { complianceExportForDownload } from "@/core/compliance-core";

export async function GET(_request: Request, { params }: {
  params: Promise<{ projectId: string; packId: string; exportId: string }>;
}) {
  const { projectId, packId, exportId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = await resolveTenantContext(db, base.userId, projectId);
  try {
    const row = await withTenant(db, ctx, (tx) =>
      complianceExportForDownload(tx, ctx, projectId, packId, exportId));
    const bytes = await getStorage().get(row.objectKey);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": "application/zip", "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="buildflow-compliance-v${row.version}.zip"`,
        "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
