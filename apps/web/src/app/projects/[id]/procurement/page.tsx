import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { listPurchaseOrders, listRfqs } from "@buildflow/db/queries/procurement";
import { listSuppliers } from "@buildflow/db/queries/materials";
import { formatINR } from "@buildflow/domain/money";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import { createRfqAction } from "@/app/actions/procurement";

export default async function ProcurementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const project = await getProject(db, ctx, id);
  const [rfqs, pos, suppliers] = await Promise.all([
    listRfqs(db, ctx, id),
    listPurchaseOrders(db, ctx, id),
    listSuppliers(db, ctx),
  ]);
  const canManage = ctx.capabilities.includes("procurement.manage");
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Procurement</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="procurement" />

        <section className="surface-card admin-section" aria-labelledby="proc-rfqs">
          <h2 id="proc-rfqs">Requests for quotation</h2>
          <p className="page-lead">Quotes are entered manually from supplier replies. Nothing is sent automatically.</p>
          {rfqs.length === 0 ? (
            <p className="admin-empty">No RFQs yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Needed by</th>
                  <th scope="col">Status</th>
                  <th scope="col">Open</th>
                </tr>
              </thead>
              <tbody>
                {rfqs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.title}</td>
                    <td>{r.neededBy ?? "—"}</td>
                    <td>{r.status}</td>
                    <td><Link href={`/projects/${id}/procurement/rfqs/${r.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canManage ? (
            <form action={createRfqAction} className="admin-form admin-form--inline">
              <input type="hidden" name="projectId" value={id} />
              <label>Title <input name="title" required /></label>
              <label>Needed by <input type="date" name="neededBy" /></label>
              <button className="primary-button" type="submit">Create RFQ</button>
            </form>
          ) : null}
        </section>

        <section className="surface-card admin-section" aria-labelledby="proc-pos">
          <h2 id="proc-pos">Purchase orders</h2>
          <p className="page-lead">
            Draft → approved (procurement.approve) → exported as CSV/JSON for your records or Tally.
            BuildFlow never sends a PO to a supplier.
          </p>
          {pos.length === 0 ? (
            <p className="admin-empty">No purchase orders. Draft one from an RFQ comparison.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">PO #</th>
                  <th scope="col">Supplier</th>
                  <th scope="col">Total</th>
                  <th scope="col">Status</th>
                  <th scope="col">Open</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => (
                  <tr key={po.id}>
                    <td>PO-{po.poNumber}</td>
                    <td>{supplierName.get(po.supplierId) ?? "—"}</td>
                    <td>{formatINR(po.totalPaise)}</td>
                    <td>{po.status}</td>
                    <td><Link href={`/projects/${id}/procurement/pos/${po.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
