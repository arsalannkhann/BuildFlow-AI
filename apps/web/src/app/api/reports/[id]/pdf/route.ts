import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { latestIssued } from "@buildflow/db/queries/issued";
import { getStorage } from "@buildflow/storage/factory";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const ctx = await currentContext();
  const issued = await withTenant(db, ctx, (tx) => latestIssued(tx, ctx, id)); // org-scoped query
  if (!issued) return new Response("Not found", { status: 404 });
  const bytes = await getStorage().get(issued.objectKey);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: { "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="DPR-${issued.documentId}.pdf"` },
  });
}
