import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { listProjects } from "@buildflow/db/queries/projects";
import { AppHeader } from "@/app/components/AppHeader";
import { createProjectAction } from "@/app/actions/admin";

export default async function ProjectsPage() {
  const db = await getDb();
  const ctx = await currentContext();
  const projects = await listProjects(db, ctx);
  const canCreate = ctx.capabilities.includes("org.manage");
  const canManage = ctx.capabilities.includes("project.manage") || canCreate;

  return (
    <>
      <AppHeader roleLabel="Projects" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell">
        <section className="reports-intro">
          <div>
            <p className="eyebrow">Organization</p>
            <h1 className="page-title">Projects</h1>
            <p className="page-lead">Every project keeps its own team, locations, activities and reports.</p>
          </div>
        </section>

        <ul className="admin-list" aria-label="Projects">
          {projects.map((p) => (
            <li key={p.id} className="surface-card admin-list__row">
              <div>
                <strong>{p.name}</strong>
                <small>{p.clientName ?? "No client set"} · {p.timezone}</small>
              </div>
              <div className="admin-list__actions">
                <Link href="/reports" className="secondary-button">Reports</Link>
                {canManage && <Link href={`/projects/${p.id}/admin`} className="secondary-button">Settings</Link>}
              </div>
            </li>
          ))}
          {projects.length === 0 && (
            <li className="surface-card admin-empty">No projects yet. Create the first one below.</li>
          )}
        </ul>

        {canCreate && (
          <section className="surface-card admin-section" aria-labelledby="new-project">
            <h2 id="new-project">Create a project</h2>
            <form action={createProjectAction} className="admin-form">
              <label>Project name<input name="name" required maxLength={120} /></label>
              <label>Client<input name="clientName" maxLength={120} /></label>
              <label>Timezone<input name="timezone" defaultValue="Asia/Kolkata" /></label>
              <label>Address<input name="address" maxLength={240} /></label>
              <button type="submit" className="primary-button">Create project</button>
            </form>
          </section>
        )}
      </main>
    </>
  );
}
