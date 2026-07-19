import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { listMaterials, listReceipts, listSuppliers, stockLevels } from "@buildflow/db/queries/materials";
import { shortageAlerts } from "@/core/materials-core";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import {
  createMaterialAction, createReceiptAction, createSupplierAction, recordStockMovementAction,
} from "@/app/actions/materials";

export default async function MaterialsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const project = await getProject(db, ctx, id);
  const [catalogue, receipts, levels, alerts, projectSuppliers] = await Promise.all([
    listMaterials(db, ctx),
    listReceipts(db, ctx, id),
    stockLevels(db, ctx, id),
    shortageAlerts(db, ctx, id),
    listSuppliers(db, ctx),
  ]);
  const canManage = ctx.capabilities.includes("material.manage");
  const canReview = ctx.capabilities.includes("material.review");
  const levelOf = new Map(levels.map((l) => [l.materialId, l.currentStock]));
  const reviewQueue = receipts.filter((r) => r.status !== "posted");

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Materials</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="materials" />

        {alerts.length > 0 ? (
          <section className="surface-card admin-section" aria-labelledby="mat-alerts">
            <h2 id="mat-alerts">Shortage alerts</h2>
            <p className="page-lead">Current stock (ledger sum) below the reorder threshold. Deterministic — no forecasting.</p>
            <ul>
              {alerts.map((a) => (
                <li key={a.materialId}>
                  <Link href={`/projects/${id}/materials/${a.materialId}`}>{a.name}</Link>{" "}
                  — {a.currentStock} {a.unit} in stock, reorder at {a.reorderThreshold} {a.unit}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="surface-card admin-section" aria-labelledby="mat-stock">
          <h2 id="mat-stock">Catalogue and stock levels</h2>
          {catalogue.length === 0 ? (
            <p className="admin-empty">No materials yet. Add the catalogue below.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Material</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Current stock</th>
                  <th scope="col">Reorder at</th>
                  <th scope="col">Ledger</th>
                </tr>
              </thead>
              <tbody>
                {catalogue.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}{m.isActive ? "" : " (inactive)"}</td>
                    <td>{m.unit}</td>
                    <td>{levelOf.get(m.id) ?? "0"} {m.unit}</td>
                    <td>{m.reorderThreshold ?? "—"}</td>
                    <td><Link href={`/projects/${id}/materials/${m.id}`}>Stock ledger</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canManage ? (
            <details>
              <summary>Add material</summary>
              <form action={createMaterialAction} className="admin-form">
                <input type="hidden" name="projectId" value={id} />
                <div className="admin-form-row">
                  <label>Name <input name="name" required /></label>
                  <label>Unit <input name="unit" placeholder="bag / kg / cum / nos" required /></label>
                </div>
                <div className="admin-form-row">
                  <label>HSN code <input name="hsnCode" /></label>
                  <label>Reorder threshold <input name="reorderThreshold" inputMode="decimal" placeholder="e.g. 100" /></label>
                </div>
                <button className="primary-button" type="submit">Add material</button>
              </form>
            </details>
          ) : null}
          {canManage && catalogue.length > 0 ? (
            <details>
              <summary>Record stock movement (issue / consume / adjust / return)</summary>
              <form action={recordStockMovementAction} className="admin-form">
                <input type="hidden" name="projectId" value={id} />
                <div className="admin-form-row">
                  <label>Material
                    <select name="materialId" required>
                      {catalogue.filter((m) => m.isActive).map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                      ))}
                    </select>
                  </label>
                  <label>Kind
                    <select name="kind" defaultValue="issued">
                      <option value="issued">issued to works</option>
                      <option value="consumed">consumed</option>
                      <option value="returned">returned to store</option>
                      <option value="adjusted">adjustment (signed)</option>
                    </select>
                  </label>
                  <label>Quantity <input name="quantity" inputMode="decimal" required /></label>
                </div>
                <label>Note <input name="note" placeholder="Where / why" /></label>
                <button className="secondary-button" type="submit">Record movement</button>
              </form>
            </details>
          ) : null}
        </section>

        <section className="surface-card admin-section" aria-labelledby="mat-receipts">
          <h2 id="mat-receipts">Receipts (challans)</h2>
          {reviewQueue.length > 0 ? (
            <p><strong>{reviewQueue.length}</strong> receipt(s) awaiting review or posting.</p>
          ) : null}
          {receipts.length === 0 ? (
            <p className="admin-empty">No receipts yet. Photograph a delivery challan below — OCR drafts the lines, a reviewer posts the stock.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Challan #</th>
                  <th scope="col">Status</th>
                  <th scope="col">OCR</th>
                  <th scope="col">Open</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <td>{r.receiptDate}</td>
                    <td>{r.challanNumber ?? "—"}</td>
                    <td>{r.status}</td>
                    <td>{r.ocrStatus ?? "manual"}</td>
                    <td><Link href={`/projects/${id}/materials/receipts/${r.id}`}>{r.status === "posted" ? "View" : "Review"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canManage ? (
            <form action={createReceiptAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <div className="admin-form-row">
                <label>Receipt date <input type="date" name="receiptDate" required /></label>
                <label>Challan number <input name="challanNumber" /></label>
                <label>Supplier
                  <select name="supplierId" defaultValue="">
                    <option value="">Unknown</option>
                    {projectSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              </div>
              <label>Challan photo (OCR drafts the lines for review)
                <input type="file" name="photo" accept="image/*" />
              </label>
              <button className="primary-button" type="submit">Add receipt</button>
            </form>
          ) : null}
          {!canReview && reviewQueue.length > 0 ? (
            <p className="muted-copy">Posting stock needs the material review capability.</p>
          ) : null}
        </section>

        <section className="surface-card admin-section" aria-labelledby="mat-suppliers">
          <h2 id="mat-suppliers">Suppliers</h2>
          {projectSuppliers.length === 0 ? (
            <p className="admin-empty">No suppliers recorded.</p>
          ) : (
            <ul>
              {projectSuppliers.map((s) => (
                <li key={s.id}>{s.name}{s.gstin ? ` — GSTIN ${s.gstin}` : ""}{s.phone ? ` — ${s.phone}` : ""}</li>
              ))}
            </ul>
          )}
          {canManage ? (
            <details>
              <summary>Add supplier</summary>
              <form action={createSupplierAction} className="admin-form admin-form--inline">
                <input type="hidden" name="projectId" value={id} />
                <label>Name <input name="name" required /></label>
                <label>GSTIN <input name="gstin" /></label>
                <label>Phone <input name="phone" /></label>
                <button className="secondary-button" type="submit">Add supplier</button>
              </form>
            </details>
          ) : null}
        </section>
      </main>
    </>
  );
}
