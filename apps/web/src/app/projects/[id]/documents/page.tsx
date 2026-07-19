import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { listDocuments } from "@buildflow/db/queries/controls";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import { registerDocumentAction } from "@/app/actions/controls";

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const project = await getProject(db, ctx, id);
  const docs = await listDocuments(db, ctx, id);
  const canManage = ctx.capabilities.includes("document.manage");

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Drawing and document register</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="documents" />

        <section className="surface-card admin-section" aria-labelledby="doc-list">
          <h2 id="doc-list">Register</h2>
          {docs.length === 0 ? <p className="admin-empty">No documents registered yet.</p> : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Number</th><th scope="col">Title</th>
                  <th scope="col">Discipline</th><th scope="col">Category</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>{d.docNumber ?? "—"}</td>
                    <td><Link href={`/projects/${id}/documents/${d.id}`}>{d.title}</Link></td>
                    <td>{d.discipline ?? "—"}</td>
                    <td>{d.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {canManage ? (
          <section className="surface-card admin-section" aria-labelledby="doc-new">
            <h2 id="doc-new">Register a document</h2>
            <form action={registerDocumentAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <div className="admin-form-row">
                <label>Title <input name="title" required /></label>
                <label>Number <input name="docNumber" placeholder="GA-001" /></label>
              </div>
              <div className="admin-form-row">
                <label>Discipline <input name="discipline" placeholder="Structural" /></label>
                <label>Category
                  <select name="category" defaultValue="drawing">
                    <option>drawing</option><option>specification</option>
                    <option>contract</option><option>other</option>
                  </select>
                </label>
              </div>
              <button className="primary-button" type="submit">Register</button>
            </form>
          </section>
        ) : null}
      </main>
    </>
  );
}
