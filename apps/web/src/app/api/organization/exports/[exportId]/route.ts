import { getDb } from "@buildflow/db/client";
import { getOrganizationExport } from "@buildflow/db/queries/organization";
import { audit } from "@buildflow/db/queries/audit";
import { assertCan } from "@buildflow/domain/tenancy";
import { getStorage } from "@buildflow/storage/factory";
import { currentContext } from "@/app/session";
import { tracedRoute } from "@/core/request-security";

export async function GET(request: Request, { params }: { params: Promise<{ exportId: string }> }) {
  return tracedRoute(request, "/api/organization/exports/:exportId", async () => {
    const db = await getDb();
    const ctx = await currentContext();
    assertCan(ctx, "org.export");
    const { exportId } = await params;
    const row = await getOrganizationExport(db, ctx, exportId);
    if (!row || row.status !== "succeeded" || !row.objectKey) return new Response("Export not found", { status: 404 });
    const storage = getStorage();
    if (storage.createSignedGetUrl) {
      const signed = await storage.createSignedGetUrl(row.objectKey, 5 * 60);
      await audit(db, ctx, {
        action: "organization.export_link_created", subjectRef: row.id,
        metadata: { expiresAt: signed.expiresAt.toISOString() },
      });
      return Response.redirect(signed.url, 303);
    }
    const bytes = await storage.get(row.objectKey);
    await audit(db, ctx, { action: "organization.export_downloaded", subjectRef: row.id, metadata: {} });
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "content-type": "application/zip", "content-disposition": `attachment; filename="buildflow-export-${row.id}.zip"`,
        "cache-control": "private, no-store", "x-content-type-options": "nosniff",
      },
    });
  });
}
