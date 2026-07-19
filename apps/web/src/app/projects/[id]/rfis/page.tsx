import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { listRfis } from "@buildflow/db/queries/controls";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import { createRfiAction } from "@/app/actions/controls";

export default async function RfisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, rfis } = await withTenant(db, ctx, async (tx) => {
    const project = await getProject(tx, ctx, id);
    const rfis = await listRfis(tx, ctx, id);
    return { project, rfis };
  });
  const canManage = ctx.capabilities.includes("rfi.manage");

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Requests for information</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="rfis" />

        <section className="surface-card admin-section" aria-labelledby="rfi-list">
          <h2 id="rfi-list">RFI register</h2>
          {rfis.length === 0 ? <p className="admin-empty">No RFIs raised yet.</p> : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">No.</th><th scope="col">Subject</th><th scope="col">Assignee</th>
                  <th scope="col">Due</th><th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rfis.map((r) => (
                  <tr key={r.id}>
                    <td>RFI-{String(r.number).padStart(3, "0")}</td>
                    <td><Link href={`/projects/${id}/rfis/${r.id}`}>{r.subject}</Link></td>
                    <td>{r.assigneeName ?? "—"}</td>
                    <td>{r.dueDate ?? "—"}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {canManage ? (
          <section className="surface-card admin-section" aria-labelledby="rfi-new">
            <h2 id="rfi-new">Raise an RFI</h2>
            <form action={createRfiAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <label>Subject <input name="subject" required /></label>
              <label>Question <textarea name="question" rows={3} required /></label>
              <div className="admin-form-row">
                <label>Assignee <input name="assigneeName" /></label>
                <label>Due date <input type="date" name="dueDate" /></label>
              </div>
              <button className="primary-button" type="submit">Create RFI</button>
            </form>
          </section>
        ) : null}
      </main>
    </>
  );
}
