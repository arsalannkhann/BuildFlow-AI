import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { getReceipt, getSupplier, listMaterials, listReceiptLines } from "@buildflow/db/queries/materials";
import { formatINR } from "@buildflow/domain/money";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import {
  addReceiptLineAction, deleteReceiptLineAction, editReceiptLineAction,
  markReceiptReviewedAction, postReceiptAction,
} from "@/app/actions/materials";

export default async function ReceiptReviewPage({ params }: { params: Promise<{ id: string; receiptId: string }> }) {
  const { id, receiptId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const project = await getProject(db, ctx, id);
  const receipt = await getReceipt(db, ctx, receiptId);
  if (!receipt || receipt.projectId !== id) notFound();
  const [lines, catalogue] = await Promise.all([
    listReceiptLines(db, ctx, receiptId),
    listMaterials(db, ctx),
  ]);
  const supplier = receipt.supplierId ? await getSupplier(db, ctx, receipt.supplierId) : null;
  const canManage = ctx.capabilities.includes("material.manage");
  const canReview = ctx.capabilities.includes("material.review");
  const editable = receipt.status !== "posted";

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Material receipt</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="materials" />

        <section className="surface-card admin-section" aria-labelledby="rcpt-head">
          <h2 id="rcpt-head">Challan {receipt.challanNumber ?? "(no number)"} — {receipt.receiptDate}</h2>
          <p>
            Status: <strong>{receipt.status}</strong>
            {supplier ? <> · Supplier: {supplier.name}</> : null}
            {receipt.ocrStatus ? (
              <> · OCR: {receipt.ocrStatus}
                {receipt.ocrProvider ? ` (${receipt.ocrProvider} ${receipt.ocrModel ?? ""}, ${receipt.ocrSchemaVersion ?? ""})` : ""}
              </>
            ) : " · Entered manually"}
          </p>
          {receipt.fileName ? (
            <p className="muted-copy">Photo evidence: {receipt.fileName} · sha256 {receipt.checksum?.slice(0, 12)}…</p>
          ) : null}
          {receipt.status === "draft" ? (
            <p className="muted-copy">
              OCR output is a draft. Map every line to a catalogue material, fix quantities, then a
              reviewer marks it reviewed and posts stock. Nothing touches stock before that.
            </p>
          ) : null}
        </section>

        <section className="surface-card admin-section" aria-labelledby="rcpt-lines">
          <h2 id="rcpt-lines">Lines</h2>
          {lines.length === 0 ? (
            <p className="admin-empty">No lines yet{receipt.ocrStatus === "queued" ? " — OCR is running" : ""}. Add lines below.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">As written</th>
                  <th scope="col">Material</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Rate</th>
                  <th scope="col">Confidence</th>
                  {editable && canManage ? <th scope="col">Fix</th> : null}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.descriptionRaw}</td>
                    <td>{catalogue.find((m) => m.id === line.materialId)?.name ?? "— unmapped —"}</td>
                    <td>{line.quantity} {line.unit}</td>
                    <td>{line.ratePaise != null ? formatINR(line.ratePaise) : "—"}</td>
                    <td>{line.confidenceBand ?? "manual"}</td>
                    {editable && canManage ? (
                      <td>
                        <details>
                          <summary>Edit</summary>
                          <form action={editReceiptLineAction} className="admin-form">
                            <input type="hidden" name="projectId" value={id} />
                            <input type="hidden" name="receiptId" value={receiptId} />
                            <input type="hidden" name="lineId" value={line.id} />
                            <label>Material
                              <select name="materialId" defaultValue={line.materialId ?? ""}>
                                <option value="">— unmapped —</option>
                                {catalogue.filter((m) => m.isActive).map((m) => (
                                  <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                                ))}
                              </select>
                            </label>
                            <label>Quantity <input name="quantity" inputMode="decimal" defaultValue={line.quantity} /></label>
                            <label>Unit <input name="unit" defaultValue={line.unit} /></label>
                            <button className="secondary-button" type="submit">Save line</button>
                          </form>
                          <form action={deleteReceiptLineAction}>
                            <input type="hidden" name="projectId" value={id} />
                            <input type="hidden" name="receiptId" value={receiptId} />
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
          {editable && canManage ? (
            <details>
              <summary>Add line</summary>
              <form action={addReceiptLineAction} className="admin-form">
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="receiptId" value={receiptId} />
                <div className="admin-form-row">
                  <label>Description <input name="descriptionRaw" required /></label>
                  <label>Material
                    <select name="materialId" defaultValue="">
                      <option value="">— unmapped —</option>
                      {catalogue.filter((m) => m.isActive).map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="admin-form-row">
                  <label>Quantity <input name="quantity" inputMode="decimal" required /></label>
                  <label>Unit <input name="unit" required /></label>
                  <label>Rate (INR) <input name="rateInr" inputMode="decimal" /></label>
                </div>
                <button className="secondary-button" type="submit">Add line</button>
              </form>
            </details>
          ) : null}
        </section>

        {canReview && editable ? (
          <section className="surface-card admin-section" aria-labelledby="rcpt-actions">
            <h2 id="rcpt-actions">Review and post</h2>
            {receipt.status === "draft" ? (
              <form action={markReceiptReviewedAction}>
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="receiptId" value={receiptId} />
                <p className="muted-copy">Confirms every line is mapped with a positive quantity. Does not touch stock yet.</p>
                <button className="primary-button" type="submit">Mark reviewed</button>
              </form>
            ) : (
              <form action={postReceiptAction}>
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="receiptId" value={receiptId} />
                <p className="muted-copy">Posts the received quantities to the stock ledger — exactly once, append-only.</p>
                <button className="primary-button" type="submit">Post stock</button>
              </form>
            )}
          </section>
        ) : null}
        {receipt.status === "posted" ? (
          <p className="muted-copy">
            Posted {receipt.postedAt?.toISOString().slice(0, 10)} — the ledger rows reference this
            receipt&apos;s lines. <Link href={`/projects/${id}/materials`}>Back to materials</Link>
          </p>
        ) : null}
      </main>
    </>
  );
}
