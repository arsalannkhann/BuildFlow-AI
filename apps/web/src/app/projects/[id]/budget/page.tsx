import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { listInvoices } from "@buildflow/db/queries/invoices";
import { formatINR } from "@buildflow/domain/money";
import { budgetRollup } from "@/core/budget-core";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import { createCostCodeAction, createInvoiceAction, importBudgetCsvAction } from "@/app/actions/budget";

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, rollup, invoices } = await withTenant(db, ctx, async (tx) => {
    const project = await getProject(tx, ctx, id);
    const [rollup, invoices] = await Promise.all([
      budgetRollup(tx, ctx, id),
      listInvoices(tx, ctx, id),
    ]);
    return { project, rollup, invoices };
  });
  const canManageBudget = ctx.capabilities.includes("budget.manage");
  const canEnterInvoice = ctx.capabilities.includes("material.manage") || ctx.capabilities.includes("invoice.review");
  const reviewQueue = invoices.filter((i) => i.status !== "approved");

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Budget and cost</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="budget" />

        <section className="surface-card admin-section" aria-labelledby="bud-rollup">
          <h2 id="bud-rollup">Budget vs actual vs committed</h2>
          {rollup.budget ? (
            <p className="page-lead">Active budget: version {rollup.budget.version}{rollup.budget.note ? ` — ${rollup.budget.note}` : ""}.</p>
          ) : (
            <p className="page-lead">No budget imported yet. Actuals and commitments still roll up below.</p>
          )}
          {rollup.rows.length === 0 ? (
            <p className="admin-empty">No budget lines, cost entries, or approved purchase orders yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Cost code</th>
                  <th scope="col">Budget</th>
                  <th scope="col">Actual</th>
                  <th scope="col">Committed</th>
                  <th scope="col">Variance</th>
                </tr>
              </thead>
              <tbody>
                {rollup.rows.map((r) => (
                  <tr key={r.costCodeId ?? "uncoded"}>
                    <td>{r.code} — {r.name}</td>
                    <td>{formatINR(r.budgetPaise)}</td>
                    <td>{formatINR(r.actualPaise)}</td>
                    <td>{formatINR(r.committedPaise)}</td>
                    <td>{formatINR(r.variancePaise)}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Total</th>
                  <td><strong>{formatINR(rollup.totals.budgetPaise)}</strong></td>
                  <td><strong>{formatINR(rollup.totals.actualPaise)}</strong></td>
                  <td><strong>{formatINR(rollup.totals.committedPaise)}</strong></td>
                  <td><strong>{formatINR(rollup.totals.budgetPaise - rollup.totals.actualPaise)}</strong></td>
                </tr>
              </tbody>
            </table>
          )}
          <p>
            Invoiced (approved invoices): <strong>{formatINR(rollup.totals.invoicedPaise)}</strong> ·
            Paid (recorded): <strong>{formatINR(rollup.totals.paidPaise)}</strong>
          </p>
          <p>
            <strong>Estimate at completion: {formatINR(rollup.eac.eacPaise)}</strong><br />
            <span className="muted-copy">{rollup.eac.formula}</span>
          </p>
          <p className="muted-copy">
            Actuals come from approved invoice lines (<Link href={`/projects/${id}/budget#bud-invoices`}>sources below</Link>);
            committed from approved purchase orders. Deterministic — no forecasting model.
          </p>
        </section>

        <section className="surface-card admin-section" aria-labelledby="bud-versions">
          <h2 id="bud-versions">Budget versions (immutable)</h2>
          {rollup.versions.length === 0 ? (
            <p className="admin-empty">No versions yet.</p>
          ) : (
            <ul>
              {rollup.versions.map((b) => (
                <li key={b.id}>
                  v{b.version} — {b.status}{b.note ? ` — ${b.note}` : ""} — {b.createdAt.toISOString().slice(0, 10)}
                </li>
              ))}
            </ul>
          )}
          {canManageBudget ? (
            <details>
              <summary>Import budget CSV (creates a new version)</summary>
              <form action={importBudgetCsvAction} className="admin-form">
                <input type="hidden" name="projectId" value={id} />
                <p className="muted-copy">Columns: code, description, quantity (optional), unit (optional), amount_inr. Prior versions stay readable, never edited.</p>
                <label>CSV file <input type="file" name="csv" accept=".csv,text/csv" required /></label>
                <label>Note <input name="note" placeholder="e.g. Rate revision after tender" /></label>
                <button className="primary-button" type="submit">Import as new version</button>
              </form>
            </details>
          ) : null}
          {canManageBudget ? (
            <details>
              <summary>Add cost code</summary>
              <form action={createCostCodeAction} className="admin-form admin-form--inline">
                <input type="hidden" name="projectId" value={id} />
                <label>Code <input name="code" required /></label>
                <label>Name <input name="name" required /></label>
                <button className="secondary-button" type="submit">Add cost code</button>
              </form>
            </details>
          ) : null}
        </section>

        <section className="surface-card admin-section" aria-labelledby="bud-invoices">
          <h2 id="bud-invoices">Invoices</h2>
          {reviewQueue.length > 0 ? (
            <p><strong>{reviewQueue.length}</strong> invoice(s) awaiting review or approval.</p>
          ) : null}
          {invoices.length === 0 ? (
            <p className="admin-empty">No invoices yet. Photograph one below — OCR drafts it, a reviewer approves it into costs.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Number</th>
                  <th scope="col">Date</th>
                  <th scope="col">Total</th>
                  <th scope="col">Status</th>
                  <th scope="col">Open</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.invoiceNumber ?? "—"}</td>
                    <td>{inv.invoiceDate ?? "—"}</td>
                    <td>{inv.totalPaise != null ? formatINR(inv.totalPaise) : "—"}</td>
                    <td>{inv.status}</td>
                    <td><Link href={`/projects/${id}/budget/invoices/${inv.id}`}>{inv.status === "approved" ? "View" : "Review"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canEnterInvoice ? (
            <form action={createInvoiceAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <div className="admin-form-row">
                <label>Invoice number <input name="invoiceNumber" /></label>
                <label>Invoice date <input type="date" name="invoiceDate" /></label>
              </div>
              <label>Invoice photo (OCR drafts header and lines)
                <input type="file" name="photo" accept="image/*" />
              </label>
              <button className="primary-button" type="submit">Add invoice</button>
            </form>
          ) : null}
        </section>
      </main>
    </>
  );
}
