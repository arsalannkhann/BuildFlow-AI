import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { markPoExported, poExportCsv, poExportJson } from "@/core/procurement-core";

// Manual PO export (CSV default, ?format=json) suitable for later Tally import.
// Downloading stamps the PO exported; nothing is ever sent to a supplier automatically.
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string; poId: string }> }) {
  const { projectId, poId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId };
  const format = new URL(req.url).searchParams.get("format") ?? "csv";

  if (format === "json") {
    const json = await withTenant(db, ctx, async (tx) => {
      const payload = await poExportJson(tx, ctx, poId);
      await markPoExported(tx, ctx, poId);
      return payload;
    });
    return new Response(JSON.stringify(json, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="po-${poId}.json"`,
      },
    });
  }
  const csv = await withTenant(db, ctx, async (tx) => {
    const payload = await poExportCsv(tx, ctx, poId);
    await markPoExported(tx, ctx, poId);
    return payload;
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="po-${poId}.csv"`,
    },
  });
}
