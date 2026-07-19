import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@buildflow/db/client";
import { resolveTenantContext } from "@buildflow/auth/context";
import { getProject } from "@buildflow/db/queries/projects";
import { listReports } from "@buildflow/db/queries/reports";
import { listAttachments } from "@buildflow/db/queries/attachments";
import { listDocuments } from "@buildflow/db/queries/controls";
import { listMbEntries } from "@buildflow/db/queries/mb";
import { COMPLIANCE_PACK_LABELS } from "@buildflow/domain/compliance/templates";
import { currentContext } from "@/app/session";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import {
  addComplianceRequirementAction, exportCompliancePackAction,
  markComplianceNotApplicableAction, reviewCompliancePackAction,
  satisfyComplianceRequirementAction, submitCompliancePackAction,
} from "@/app/actions/compliance";
import { compliancePackDetail } from "@/core/compliance-core";

export const dynamic = "force-dynamic";

export default async function CompliancePackPage({ params }: {
  params: Promise<{ id: string; packId: string }>;
}) {
  const { id, packId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = await resolveTenantContext(db, base.userId, id);
  const project = await getProject(db, ctx, id);
  let detail;
  try { detail = await compliancePackDetail(db, ctx, packId); } catch { notFound(); }
  const { pack, requirements, exports } = detail;
  if (pack.projectId !== id) notFound();
  const canManage = ctx.capabilities.includes("compliance.manage");
  const canReview = ctx.capabilities.includes("compliance.review");
  const editable = pack.status === "draft" && canManage;
  const pending = requirements.filter((r) => r.status === "pending").length;
  const resolved = requirements.length - pending;

  const reports = editable ? (await listReports(db, ctx)).filter((r) => r.projectId === id && ["APPROVED", "ISSUED", "SUPERSEDED"].includes(r.status)) : [];
  const attachments = editable ? (await Promise.all(reports.map((r) => listAttachments(db, ctx, r.id)))).flat() : [];
  const documents = editable ? (await listDocuments(db, ctx, id)).filter((d) => d.currentRevisionId) : [];
  const mbEntries = editable ? (await listMbEntries(db, ctx, id, { status: "certified" })).filter((e) => !e.supersededBy) : [];

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell compliance-page">
        <p className="eyebrow">Compliance evidence pack</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="compliance" />
        <Link href={`/projects/${id}/compliance`} className="compliance-back">← All compliance packs</Link>

        <header className="compliance-pack-header">
          <div>
            <span className={`compliance-status compliance-status--${pack.status.replace("_", "-")}`}>{pack.status.replace("_", " ")}</span>
            <h2>{pack.title}</h2>
            <p>{COMPLIANCE_PACK_LABELS[pack.kind as keyof typeof COMPLIANCE_PACK_LABELS]} · {pack.periodStart} to {pack.periodEnd}</p>
          </div>
          <div className="compliance-progress" aria-label={`${resolved} of ${requirements.length} requirements resolved`}>
            <strong>{resolved}/{requirements.length}</strong><span>requirements resolved</span>
          </div>
        </header>

        <div className="compliance-caution" role="note"><strong>Before you use this export</strong><span>{pack.legalCaution}</span></div>

        <section className="compliance-requirements" aria-labelledby="requirements">
          <div className="compliance-section-heading"><div><h2 id="requirements">Evidence checklist</h2><p>Link each item to an approved or certified source record, or explain why it does not apply.</p></div><span>{pending} pending</span></div>
          <ol className="compliance-requirement-list">
            {requirements.map((requirement) => (
              <li key={requirement.id} className={`compliance-requirement compliance-requirement--${requirement.status.replace("_", "-")}`}>
                <div className="compliance-requirement__body">
                  <span className="compliance-requirement__state">{requirement.status === "satisfied" ? "✓ Satisfied" : requirement.status === "not_applicable" ? "— Not applicable" : "○ Pending"}</span>
                  <h3>{requirement.requirementText}</h3>
                  <p>{requirement.ownerName || "No owner"}{requirement.dueDate ? ` · Due ${requirement.dueDate}` : " · No due date"}</p>
                  {requirement.satisfiedByKind ? <p className="compliance-evidence-ref">Evidence: {requirement.satisfiedByKind}{requirement.satisfiedByRef ? ` · ${requirement.satisfiedByRef}` : ""}</p> : null}
                  {requirement.note ? <blockquote>{requirement.note}</blockquote> : null}
                </div>
                {editable ? (
                  <details className="compliance-requirement__actions">
                    <summary>Add evidence or resolve</summary>
                    <form action={satisfyComplianceRequirementAction} className="compliance-evidence-form">
                      <input type="hidden" name="projectId" value={id} /><input type="hidden" name="packId" value={pack.id} /><input type="hidden" name="requirementId" value={requirement.id} />
                      <label>Evidence record
                        <select name="evidence" required defaultValue="">
                          <option value="" disabled>Choose a source record</option>
                          {reports.length ? <optgroup label="Approved reports">{reports.map((r) => <option key={r.id} value={`report:${r.id}`}>{r.reportDate} · {r.status}</option>)}</optgroup> : null}
                          {attachments.length ? <optgroup label="Report attachments">{attachments.map((a) => <option key={a.id} value={`attachment:${a.id}`}>{a.kind} · {a.id.slice(0, 8)}</option>)}</optgroup> : null}
                          {documents.length ? <optgroup label="Current documents">{documents.map((d) => <option key={d.id} value={`document:${d.id}`}>{d.title}</option>)}</optgroup> : null}
                          {mbEntries.length ? <optgroup label="Certified measurements">{mbEntries.map((e) => <option key={e.id} value={`mb_entry:${e.id}`}>MB-{e.mbNumber} · {e.description}</option>)}</optgroup> : null}
                          <option value="note">Written note only</option>
                        </select>
                      </label>
                      <label>Evidence note <input name="note" placeholder="Required when using written note only" /></label>
                      <button className="secondary-button" type="submit">Mark satisfied</button>
                    </form>
                    <form action={markComplianceNotApplicableAction} className="compliance-na-form">
                      <input type="hidden" name="projectId" value={id} /><input type="hidden" name="packId" value={pack.id} /><input type="hidden" name="requirementId" value={requirement.id} />
                      <label>Not applicable because <input name="note" required /></label>
                      <button type="submit">Mark not applicable</button>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        {editable ? (
          <section className="compliance-add-requirement" aria-labelledby="add-requirement">
            <div className="compliance-section-heading"><div><h2 id="add-requirement">Add a project-specific item</h2><p>Use plain operational language and assign a real owner.</p></div></div>
            <form action={addComplianceRequirementAction} className="compliance-create__form">
              <input type="hidden" name="projectId" value={id} /><input type="hidden" name="packId" value={pack.id} />
              <label>Requirement <input name="requirementText" required /></label>
              <label>Owner <input name="ownerName" /></label>
              <label>Due date <input type="date" name="dueDate" /></label>
              <button className="secondary-button" type="submit">Add item</button>
            </form>
          </section>
        ) : null}

        <section className="compliance-review-bar" aria-labelledby="review-export">
          <div><h2 id="review-export">Review and export</h2><p>Exports are immutable. Re-exporting creates the next version without replacing prior files.</p></div>
          <div className="compliance-review-bar__actions">
            {pack.status === "draft" && canManage ? <form action={submitCompliancePackAction}><input type="hidden" name="projectId" value={id} /><input type="hidden" name="packId" value={pack.id} /><button className="primary-button" type="submit" disabled={pending > 0 || requirements.length === 0}>Submit for review</button></form> : null}
            {pack.status === "in_review" && canReview ? <form action={reviewCompliancePackAction}><input type="hidden" name="projectId" value={id} /><input type="hidden" name="packId" value={pack.id} /><button className="primary-button" type="submit">Complete human review</button></form> : null}
            {(canManage || canReview) && requirements.length > 0 ? <form action={exportCompliancePackAction}><input type="hidden" name="projectId" value={id} /><input type="hidden" name="packId" value={pack.id} /><button className="secondary-button" type="submit">Export {pack.status === "reviewed" || pack.status === "exported" ? "reviewed" : "DRAFT"} ZIP</button></form> : null}
          </div>
        </section>

        {exports.length > 0 ? (
          <section className="compliance-export-history" aria-labelledby="export-history"><div className="compliance-section-heading"><div><h2 id="export-history">Export history</h2><p>Checksums identify the exact immutable bundle.</p></div></div>
            <ul>{exports.map((row) => <li key={row.id}><a href={`/api/projects/${id}/compliance/${pack.id}/exports/${row.id}`}>Version {row.version} · {(row.byteSize / 1024).toFixed(1)} KB</a><code>sha256 {row.checksum}</code><time>{row.createdAt.toISOString()}</time></li>)}</ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
