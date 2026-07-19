import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { getRfq } from "@buildflow/db/queries/procurement";
import { listMaterials, listSuppliers } from "@buildflow/db/queries/materials";
import { listCostCodes } from "@buildflow/db/queries/budgets";
import { formatINR } from "@buildflow/domain/money";
import { rfqComparison } from "@/core/procurement-core";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import {
  addRfqItemAction, closeRfqAction, createPoDraftAction, recordQuoteAction,
} from "@/app/actions/procurement";

export default async function RfqPage({ params }: { params: Promise<{ id: string; rfqId: string }> }) {
  const { id, rfqId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, rfq } = await withTenant(db, ctx, async (tx) => ({
    project: await getProject(tx, ctx, id),
    rfq: await getRfq(tx, ctx, rfqId),
  }));
  if (!rfq || rfq.projectId !== id) notFound();
  const [comparison, suppliers, materials, costCodes] = await withTenant(db, ctx, (tx) => Promise.all([
    rfqComparison(tx, ctx, rfqId),
    listSuppliers(tx, ctx),
    listMaterials(tx, ctx),
    listCostCodes(tx, ctx),
  ]));
  const canManage = ctx.capabilities.includes("procurement.manage");
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const quotedSuppliers = [...new Set(comparison.flatMap((c) => c.quotes.map((q) => q.supplierId)))];

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">RFQ</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="procurement" />

        <section className="surface-card admin-section" aria-labelledby="rfq-head">
          <h2 id="rfq-head">{rfq.title} — {rfq.status}</h2>
          {rfq.neededBy ? <p>Needed by {rfq.neededBy}.</p> : null}

          {comparison.length === 0 ? (
            <p className="admin-empty">No items yet.</p>
          ) : (
            comparison.map(({ item, quotes }) => (
              <div key={item.id}>
                <h3>{item.description} — {item.quantity} {item.unit}</h3>
                {quotes.length === 0 ? (
                  <p className="admin-empty">No quotes recorded.</p>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">Supplier</th>
                        <th scope="col">Rate</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Delivery</th>
                        <th scope="col">Lowest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.map((q) => (
                        <tr key={q.id}>
                          <td>{supplierName.get(q.supplierId) ?? q.supplierId}</td>
                          <td>{formatINR(q.ratePaise)} / {item.unit}</td>
                          <td>{formatINR(q.amountPaise)}</td>
                          <td>{q.deliveryDays != null ? `${q.deliveryDays} day(s)` : "—"}</td>
                          <td>{q.isLowest ? "Lowest rate" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {canManage && rfq.status === "open" ? (
                  <details>
                    <summary>Record supplier quote</summary>
                    <form action={recordQuoteAction} className="admin-form admin-form--inline">
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="rfqId" value={rfqId} />
                      <input type="hidden" name="rfqItemId" value={item.id} />
                      <label>Supplier
                        <select name="supplierId" required>
                          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </label>
                      <label>Rate (INR / {item.unit}) <input name="rateInr" inputMode="decimal" required /></label>
                      <label>Delivery days <input type="number" name="deliveryDays" min={0} /></label>
                      <button className="secondary-button" type="submit">Save quote</button>
                    </form>
                  </details>
                ) : null}
              </div>
            ))
          )}

          {canManage && rfq.status === "open" ? (
            <details>
              <summary>Add item</summary>
              <form action={addRfqItemAction} className="admin-form admin-form--inline">
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="rfqId" value={rfqId} />
                <label>Description <input name="description" required /></label>
                <label>Quantity <input name="quantity" inputMode="decimal" required /></label>
                <label>Unit <input name="unit" required /></label>
                <label>Material
                  <select name="materialId" defaultValue="">
                    <option value="">—</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <button className="secondary-button" type="submit">Add item</button>
              </form>
            </details>
          ) : null}
        </section>

        {canManage && quotedSuppliers.length > 0 ? (
          <section className="surface-card admin-section" aria-labelledby="rfq-po">
            <h2 id="rfq-po">Draft purchase order</h2>
            <p className="muted-copy">
              Drafts a PO from one supplier&apos;s quotes. It stays a draft until someone with
              procurement approval approves it; export is always a manual download.
            </p>
            <form action={createPoDraftAction} className="admin-form admin-form--inline">
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="rfqId" value={rfqId} />
              <label>Supplier
                <select name="supplierId" required>
                  {quotedSuppliers.map((sid) => (
                    <option key={sid} value={sid}>{supplierName.get(sid) ?? sid}</option>
                  ))}
                </select>
              </label>
              <label>Cost code (committed rollup)
                <select name="costCodeId" defaultValue="">
                  <option value="">— uncoded —</option>
                  {costCodes.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
              </label>
              <button className="primary-button" type="submit">Create PO draft</button>
            </form>
            {rfq.status === "open" ? (
              <form action={closeRfqAction}>
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="rfqId" value={rfqId} />
                <button className="secondary-button" type="submit">Close RFQ</button>
              </form>
            ) : null}
          </section>
        ) : null}
        <p className="muted-copy"><Link href={`/projects/${id}/procurement`}>Back to procurement</Link></p>
      </main>
    </>
  );
}
