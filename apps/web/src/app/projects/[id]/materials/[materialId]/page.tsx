import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { getMaterial, stockLedger, stockLevels } from "@buildflow/db/queries/materials";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";

const SIGN: Record<string, string> = { received: "+", returned: "+", issued: "−", consumed: "−", adjusted: "±" };

export default async function StockLedgerPage({ params }: { params: Promise<{ id: string; materialId: string }> }) {
  const { id, materialId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, material } = await withTenant(db, ctx, async (tx) => {
    const project = await getProject(tx, ctx, id);
    const material = await getMaterial(tx, ctx, materialId);
    return { project, material };
  });
  if (!material) notFound();
  const [ledger, levels] = await withTenant(db, ctx, (tx) => Promise.all([
    stockLedger(tx, ctx, id, materialId),
    stockLevels(tx, ctx, id),
  ]));
  const current = levels.find((l) => l.materialId === materialId)?.currentStock ?? "0";

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Stock ledger</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="materials" />

        <section className="surface-card admin-section" aria-labelledby="ledger-head">
          <h2 id="ledger-head">{material.name}</h2>
          <p>
            Current stock: <strong>{current} {material.unit}</strong> (sum of the append-only ledger below).
            {material.reorderThreshold ? <> Reorder threshold: {material.reorderThreshold} {material.unit}.</> : null}
          </p>
          {ledger.length === 0 ? (
            <p className="admin-empty">No movements recorded yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Source</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.createdAt.toISOString().slice(0, 10)}</td>
                    <td>{SIGN[tx.kind] ?? ""} {tx.kind}</td>
                    <td>{tx.quantity} {tx.unit}</td>
                    <td>
                      {tx.receiptId ? (
                        <Link href={`/projects/${id}/materials/receipts/${tx.receiptId}`}>Receipt</Link>
                      ) : (tx.sourceKind ?? "manual")}
                    </td>
                    <td>{tx.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link className="secondary-button" href={`/projects/${id}/materials`}>Back to materials</Link>
        </section>
      </main>
    </>
  );
}
