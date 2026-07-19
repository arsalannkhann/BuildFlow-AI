import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { mbRegisterCsv } from "@/core/mb-core";

// MB register export — every entry with status, formula, and correction cross-references.
// Access is capability-checked in the core (project.read) and org-scoped by the queries.
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId };
  const csv = await withTenant(db, ctx, (tx) => mbRegisterCsv(tx, ctx, projectId));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mb-register-${projectId}.csv"`,
    },
  });
}
