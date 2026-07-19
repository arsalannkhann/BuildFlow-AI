import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { getPurchaseOrder, listPoLines } from "@buildflow/db/queries/procurement";
import { getSupplier } from "@buildflow/db/queries/materials";
import { formatINR } from "@buildflow/domain/money";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import { approvePoAction } from "@/app/actions/procurement";

export default async function PoPage({ params }: { params: Promise<{ id: string; poId: string }> }) {
  const { id, poId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, po } = await withTenant(db, ctx, async (tx) => {
    const project = await getProject(tx, ctx, id);
    const po = await getPurchaseOrder(tx, ctx, poId);
    return { project, po };
  });
  if (!po || po.projectId !== id) notFound();
  const [lines, supplier] = await withTenant(db, ctx, (tx) => Promise.all([
    listPoLines(tx, ctx, poId),
    getSupplier(tx, ctx, po.supplierId),
  ]));
  const canApprove = ctx.capabilities.includes("procurement.approve");
  const canManage = ctx.capabilities.includes("procurement.manage");

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Purchase order</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="procurement" />

        <section className="surface-card admin-section" aria-labelledby="po-head">
          <h2 id="po-head">PO-{po.poNumber} — {supplier?.name ?? "Unknown supplier"}</h2>
          <p>
            Status: <strong>{po.status}</strong> · Total: <strong>{formatINR(po.totalPaise)}</strong>
            {po.approvedAt ? ` · approved ${po.approvedAt.toISOString().slice(0, 10)}` : ""}
            {po.exportedAt ? ` · exported ${po.exportedAt.toISOString().slice(0, 10)}` : ""}
          </p>
          {po.rfqId ? (
            <p><Link href={`/projects/${id}/procurement/rfqs/${po.rfqId}`}>Source RFQ and quote comparison</Link></p>
          ) : null}
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col">Quantity</th>
                <th scope="col">Rate</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.description}</td>
                  <td>{line.quantity} {line.unit}</td>
                  <td>{formatINR(line.ratePaise)}</td>
                  <td>{formatINR(line.amountPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {po.status === "draft" ? (
            canApprove ? (
              <form action={approvePoAction}>
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="poId" value={poId} />
                <p className="muted-copy">Approval commits this amount in the budget rollup. The PO is still not sent anywhere.</p>
                <button className="primary-button" type="submit">Approve purchase order</button>
              </form>
            ) : (
              <p className="muted-copy">Awaiting approval by someone with the procurement approval capability.</p>
            )
          ) : null}

          {po.status !== "draft" && canManage ? (
            <p>
              <a className="secondary-button" href={`/api/projects/${id}/pos/${poId}/export`}>Download CSV (Tally import)</a>{" "}
              <a className="secondary-button" href={`/api/projects/${id}/pos/${poId}/export?format=json`}>Download JSON</a>
            </p>
          ) : null}
          <p className="muted-copy">
            BuildFlow never sends purchase orders to suppliers — export and share through your
            own channel. <Link href={`/projects/${id}/procurement`}>Back to procurement</Link>
          </p>
        </section>
      </main>
    </>
  );
}
