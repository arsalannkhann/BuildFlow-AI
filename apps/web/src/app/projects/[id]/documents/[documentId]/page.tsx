import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { getDocument, listDocumentRevisions } from "@buildflow/db/queries/controls";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import { uploadDocumentRevisionAction } from "@/app/actions/controls";
import { notFound } from "next/navigation";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, doc } = await withTenant(db, ctx, async (tx) => ({
    project: await getProject(tx, ctx, id),
    doc: await getDocument(tx, ctx, documentId),
  }));
  if (!doc || doc.projectId !== id) notFound();
  const revisions = await withTenant(db, ctx, (tx) => listDocumentRevisions(tx, ctx, documentId));
  const canManage = ctx.capabilities.includes("document.manage");

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">{project.name} · {doc.docNumber ?? doc.category}</p>
        <h1 className="page-title">{doc.title}</h1>
        <ProjectNav projectId={id} active="documents" />

        <section className="surface-card admin-section" aria-labelledby="rev-list">
          <h2 id="rev-list">Revisions (append-only)</h2>
          {revisions.length === 0 ? <p className="admin-empty">No revisions uploaded yet.</p> : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Rev</th><th scope="col">Status</th><th scope="col">Notes</th>
                  <th scope="col">File</th><th scope="col">Added</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((r) => (
                  <tr key={r.id}>
                    <td>{r.revisionLabel}{doc.currentRevisionId === r.id ? " (current)" : ""}</td>
                    <td>{r.status}</td>
                    <td>{r.notes ?? "—"}</td>
                    <td>{r.fileName ?? "—"}</td>
                    <td>{r.createdAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {canManage ? (
          <section className="surface-card admin-section" aria-labelledby="rev-new">
            <h2 id="rev-new">Add revision</h2>
            <form action={uploadDocumentRevisionAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="documentId" value={doc.id} />
              <div className="admin-form-row">
                <label>Revision label <input name="revisionLabel" required placeholder="B" /></label>
                <label>File <input type="file" name="file" /></label>
              </div>
              <label>What changed <input name="notes" placeholder="Column grid shifted 150mm" /></label>
              <button className="primary-button" type="submit">Add revision</button>
            </form>
          </section>
        ) : null}
      </main>
    </>
  );
}
