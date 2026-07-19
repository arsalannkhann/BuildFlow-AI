import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { resolveTenantContext } from "@buildflow/auth/context";
import { getProject } from "@buildflow/db/queries/projects";
import { COMPLIANCE_LEGAL_CAUTION, COMPLIANCE_PACK_LABELS } from "@buildflow/domain/compliance/templates";
import { currentContext } from "@/app/session";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import { createCompliancePackAction } from "@/app/actions/compliance";
import { complianceDashboard } from "@/core/compliance-core";

export const dynamic = "force-dynamic";

export default async function CompliancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = await resolveTenantContext(db, base.userId, id);
  const project = await getProject(db, ctx, id);
  const packs = await complianceDashboard(db, ctx, id);
  const canManage = ctx.capabilities.includes("compliance.manage");
  const overdue = packs.reduce((sum, pack) => sum + pack.overdue, 0);

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell compliance-page">
        <div className="compliance-title-row">
          <div>
            <p className="eyebrow">Evidence and review</p>
            <h1 className="page-title">{project.name}</h1>
          </div>
          <span className="compliance-scope-label">Internal workflow · no submission</span>
        </div>
        <ProjectNav projectId={id} active="compliance" />

        <div className="compliance-caution" role="note">
          <strong>Evidence organizer, not a regulator portal.</strong>
          <span>{COMPLIANCE_LEGAL_CAUTION}</span>
        </div>

        {overdue > 0 ? (
          <div className="compliance-warning" role="status">
            <strong>{overdue} overdue evidence requirement{overdue === 1 ? "" : "s"}</strong>
            <span>Open the affected packs and attach a source record or document why it does not apply.</span>
          </div>
        ) : null}

        <section className="compliance-register" aria-labelledby="pack-register">
          <div className="compliance-section-heading">
            <div><h2 id="pack-register">Compliance packs</h2><p>Versioned evidence bundles with a human review gate.</p></div>
            <span>{packs.length} total</span>
          </div>
          {packs.length === 0 ? (
            <div className="compliance-empty">
              <h3>No evidence packs yet</h3>
              <p>Create a small checklist from a template, connect real project records, then export a reviewable bundle.</p>
            </div>
          ) : (
            <div className="compliance-pack-list">
              {packs.map((pack) => {
                const complete = pack.requirements.length - pack.pending;
                return (
                  <Link key={pack.id} href={`/projects/${id}/compliance/${pack.id}`} className="compliance-pack-row">
                    <span className={`compliance-status compliance-status--${pack.status.replace("_", "-")}`}>{pack.status.replace("_", " ")}</span>
                    <span className="compliance-pack-row__main"><strong>{pack.title}</strong><small>{COMPLIANCE_PACK_LABELS[pack.kind as keyof typeof COMPLIANCE_PACK_LABELS]} · {pack.periodStart} to {pack.periodEnd}</small></span>
                    <span className="compliance-pack-row__progress"><strong>{complete}/{pack.requirements.length}</strong><small>resolved</small></span>
                    {pack.overdue > 0 ? <span className="compliance-overdue">{pack.overdue} overdue</span> : <span aria-hidden="true">→</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {canManage ? (
          <section className="compliance-create" aria-labelledby="create-pack">
            <div className="compliance-section-heading"><div><h2 id="create-pack">Create an evidence pack</h2><p>Templates are editable operational checklists, not legal requirements.</p></div></div>
            <form action={createCompliancePackAction} className="compliance-create__form">
              <input type="hidden" name="projectId" value={id} />
              <label>Template
                <select name="kind" required defaultValue="dpcc_dust">
                  {Object.entries(COMPLIANCE_PACK_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <label>Pack title <input name="title" placeholder="Optional — generated from template" /></label>
              <label>Period starts <input type="date" name="periodStart" required /></label>
              <label>Period ends <input type="date" name="periodEnd" required /></label>
              <button className="primary-button" type="submit">Create pack</button>
            </form>
          </section>
        ) : null}
      </main>
    </>
  );
}
