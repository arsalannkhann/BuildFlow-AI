import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { getInvoice, listInvoiceLines, listPayments } from "@buildflow/db/queries/invoices";
import { listCostCodes } from "@buildflow/db/queries/budgets";
import { formatINR } from "@buildflow/domain/money";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import {
  addInvoiceLineAction, approveInvoiceAction, deleteInvoiceLineAction, editInvoiceLineAction,
  markInvoiceReviewedAction, recordPaymentAction, updateInvoiceHeaderAction,
} from "@/app/actions/budget";

export default async function InvoiceReviewPage({ params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  const { id, invoiceId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, invoice } = await withTenant(db, ctx, async (tx) => {
    const project = await getProject(tx, ctx, id);
    const invoice = await getInvoice(tx, ctx, invoiceId);
    return { project, invoice };
  });
  if (!invoice || invoice.projectId !== id) notFound();
  const [lines, costCodes, payments] = await withTenant(db, ctx, (tx) => Promise.all([
    listInvoiceLines(tx, ctx, invoiceId),
    listCostCodes(tx, ctx),
    listPayments(tx, ctx, id),
  ]));
  const invoicePayments = payments.filter((p) => p.invoiceId === invoiceId);
  const canReview = ctx.capabilities.includes("invoice.review");
  const canEnter = canReview || ctx.capabilities.includes("material.manage");
  const editable = invoice.status !== "approved";

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Invoice</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="budget" />

        <section className="surface-card admin-section" aria-labelledby="inv-head">
          <h2 id="inv-head">Invoice {invoice.invoiceNumber ?? "(no number)"} — {invoice.invoiceDate ?? "no date"}</h2>
          <p>
            Status: <strong>{invoice.status}</strong>
            {invoice.gstin ? <> · GSTIN: {invoice.gstin}</> : null}
            {invoice.ocrStatus ? (
              <> · OCR: {invoice.ocrStatus}
                {invoice.ocrProvider ? ` (${invoice.ocrProvider} ${invoice.ocrModel ?? ""}, ${invoice.ocrSchemaVersion ?? ""})` : ""}
              </>
            ) : " · Entered manually"}
          </p>
          <p>
            Subtotal: {invoice.subtotalPaise != null ? formatINR(invoice.subtotalPaise) : "—"} ·
            Tax: {invoice.taxPaise != null ? formatINR(invoice.taxPaise) : "—"} ·
            Total: <strong>{invoice.totalPaise != null ? formatINR(invoice.totalPaise) : "—"}</strong>
          </p>
          {invoice.fileName ? (
            <p className="muted-copy">Photo evidence: {invoice.fileName} · sha256 {invoice.checksum?.slice(0, 12)}…</p>
          ) : null}
          {editable && canEnter ? (
            <details>
              <summary>Edit header</summary>
              <form action={updateInvoiceHeaderAction} className="admin-form">
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <div className="admin-form-row">
                  <label>Number <input name="invoiceNumber" defaultValue={invoice.invoiceNumber ?? ""} /></label>
                  <label>Date <input type="date" name="invoiceDate" defaultValue={invoice.invoiceDate ?? ""} /></label>
                </div>
                <div className="admin-form-row">
                  <label>Subtotal (INR) <input name="subtotalInr" inputMode="decimal" defaultValue={invoice.subtotalPaise != null ? (invoice.subtotalPaise / 100).toFixed(2) : ""} /></label>
                  <label>Tax (INR) <input name="taxInr" inputMode="decimal" defaultValue={invoice.taxPaise != null ? (invoice.taxPaise / 100).toFixed(2) : ""} /></label>
                  <label>Total (INR) <input name="totalInr" inputMode="decimal" defaultValue={invoice.totalPaise != null ? (invoice.totalPaise / 100).toFixed(2) : ""} /></label>
                </div>
                <button className="secondary-button" type="submit">Save header</button>
              </form>
            </details>
          ) : null}
        </section>

        <section className="surface-card admin-section" aria-labelledby="inv-lines">
          <h2 id="inv-lines">Lines</h2>
          {lines.length === 0 ? (
            <p className="admin-empty">No lines yet{invoice.ocrStatus === "queued" ? " — OCR is running" : ""}.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Cost code</th>
                  <th scope="col">Confidence</th>
                  {editable && canEnter ? <th scope="col">Fix</th> : null}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.description}{line.hsn ? ` (HSN ${line.hsn})` : ""}</td>
                    <td>{line.quantity ? `${line.quantity} ${line.unit ?? ""}` : "—"}</td>
                    <td>{line.amountPaise != null ? formatINR(line.amountPaise) : "—"}</td>
                    <td>{costCodes.find((c) => c.id === line.costCodeId)?.code ?? "—"}</td>
                    <td>{line.confidenceBand ?? "manual"}</td>
                    {editable && canEnter ? (
                      <td>
                        <details>
                          <summary>Edit</summary>
                          <form action={editInvoiceLineAction} className="admin-form">
                            <input type="hidden" name="projectId" value={id} />
                            <input type="hidden" name="invoiceId" value={invoiceId} />
                            <input type="hidden" name="lineId" value={line.id} />
                            <label>Amount (INR)
                              <input name="amountInr" inputMode="decimal"
                                defaultValue={line.amountPaise != null ? (line.amountPaise / 100).toFixed(2) : ""} />
                            </label>
                            <label>Cost code
                              <select name="costCodeId" defaultValue={line.costCodeId ?? ""}>
                                <option value="">— uncoded —</option>
                                {costCodes.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                              </select>
                            </label>
                            <button className="secondary-button" type="submit">Save line</button>
                          </form>
                          <form action={deleteInvoiceLineAction}>
                            <input type="hidden" name="projectId" value={id} />
                            <input type="hidden" name="invoiceId" value={invoiceId} />
                            <input type="hidden" name="lineId" value={line.id} />
                            <button className="danger-button" type="submit">Remove line</button>
                          </form>
                        </details>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {editable && canEnter ? (
            <details>
              <summary>Add line</summary>
              <form action={addInvoiceLineAction} className="admin-form">
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <div className="admin-form-row">
                  <label>Description <input name="description" required /></label>
                  <label>Quantity <input name="quantity" inputMode="decimal" /></label>
                  <label>Unit <input name="unit" /></label>
                </div>
                <div className="admin-form-row">
                  <label>Amount (INR) <input name="amountInr" inputMode="decimal" required /></label>
                  <label>Cost code
                    <select name="costCodeId" defaultValue="">
                      <option value="">— uncoded —</option>
                      {costCodes.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                    </select>
                  </label>
                </div>
                <button className="secondary-button" type="submit">Add line</button>
              </form>
            </details>
          ) : null}
        </section>

        {canReview && editable ? (
          <section className="surface-card admin-section" aria-labelledby="inv-actions">
            <h2 id="inv-actions">Review and approve</h2>
            {invoice.status === "draft" ? (
              <form action={markInvoiceReviewedAction}>
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <p className="muted-copy">Confirms header and line amounts. Costs are not posted yet.</p>
                <button className="primary-button" type="submit">Mark reviewed</button>
              </form>
            ) : (
              <form action={approveInvoiceAction}>
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <p className="muted-copy">Posts each line as a cost entry — exactly once, append-only.</p>
                <button className="primary-button" type="submit">Approve and post costs</button>
              </form>
            )}
          </section>
        ) : null}

        {invoice.status === "approved" ? (
          <section className="surface-card admin-section" aria-labelledby="inv-payments">
            <h2 id="inv-payments">Payments (recorded, never executed)</h2>
            {invoicePayments.length === 0 ? (
              <p className="admin-empty">No payments recorded.</p>
            ) : (
              <ul>
                {invoicePayments.map((p) => (
                  <li key={p.id}>{p.paidDate} — {formatINR(p.amountPaise)}{p.reference ? ` — ${p.reference}` : ""}</li>
                ))}
              </ul>
            )}
            {canReview ? (
              <form action={recordPaymentAction} className="admin-form admin-form--inline">
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <label>Amount (INR) <input name="amountInr" inputMode="decimal" required /></label>
                <label>Paid date <input type="date" name="paidDate" required /></label>
                <label>Reference <input name="reference" placeholder="UTR / cheque no." /></label>
                <button className="secondary-button" type="submit">Record payment</button>
              </form>
            ) : null}
            <p className="muted-copy"><Link href={`/projects/${id}/budget`}>Back to budget</Link></p>
          </section>
        ) : null}
      </main>
    </>
  );
}
