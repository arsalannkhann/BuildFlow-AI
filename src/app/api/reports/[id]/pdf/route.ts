import { getDb } from "@/db/client";
import { currentContext } from "@/app/session";
import { latestIssued } from "@/db/queries/issued";
import { LocalFsStorage } from "@/storage/local-fs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const ctx = await currentContext();
  const issued = await latestIssued(db, ctx, id); // org-scoped query
  if (!issued) return new Response("Not found", { status: 404 });
  const bytes = await new LocalFsStorage().get(issued.objectKey);
  return new Response(bytes, {
    headers: { "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="DPR-${issued.documentId}.pdf"` },
  });
}
