import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { raBillCsv } from "@/core/mb-core";

// RA-bill supporting statement — certified, non-superseded quantities grouped by work
// item. Supporting data for a bill, not the bill itself (e-MB Preview, not authoritative).
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const csv = await raBillCsv(db, { ...base, projectId }, projectId);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ra-bill-support-${projectId}.csv"`,
    },
  });
}
