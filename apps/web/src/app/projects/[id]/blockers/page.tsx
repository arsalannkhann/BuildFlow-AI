import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { listBlockers, listScheduleItems } from "@buildflow/db/queries/controls";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import { raiseBlockerAction, resolveBlockerAction, updateBlockerAction } from "@/app/actions/controls";

export default async function BlockersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, blockers, items } = await withTenant(db, ctx, async (tx) => {
    const project = await getProject(tx, ctx, id);
    const [blockers, items] = await Promise.all([
      listBlockers(tx, ctx, id), listScheduleItems(tx, ctx, id),
    ]);
    return { project, blockers, items };
  });
  const open = blockers.filter((b) => b.status !== "resolved");
  const resolved = blockers.filter((b) => b.status === "resolved");
  const canManage = ctx.capabilities.includes("blocker.manage");

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Blockers</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="blockers" />

        <section className="surface-card admin-section" aria-labelledby="blk-open">
          <h2 id="blk-open">Open ({open.length})</h2>
          {open.length === 0 ? <p className="admin-empty">No open blockers.</p> : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Blocker</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Due</th>
                  <th scope="col">Status</th>
                  {canManage ? <th scope="col">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {open.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.title}</strong>
                      {b.description ? <><br /><small>{b.description}</small></> : null}
                      {b.reportId ? <><br /><a href={`/reports/${b.reportId}`}>Source report</a></> : null}
                    </td>
                    <td><span className={`severity-chip severity-${b.severity}`}>{b.severity}</span></td>
                    <td>{b.ownerName ?? "—"}</td>
                    <td>{b.dueDate ?? "—"}</td>
                    <td>{b.status}</td>
                    {canManage ? (
                      <td>
                        <details>
                          <summary>Update</summary>
                          <form action={updateBlockerAction} className="admin-form">
                            <input type="hidden" name="projectId" value={id} />
                            <input type="hidden" name="blockerId" value={b.id} />
                            <label>Severity
                              <select name="severity" defaultValue={b.severity}>
                                <option>low</option><option>medium</option>
                                <option>high</option><option>critical</option>
                              </select>
                            </label>
                            <label>Owner <input name="ownerName" defaultValue={b.ownerName ?? ""} /></label>
                            <label>Due date <input type="date" name="dueDate" defaultValue={b.dueDate ?? ""} /></label>
                            <label>Status
                              <select name="status" defaultValue={b.status}>
                                <option value="open">open</option>
                                <option value="in_progress">in progress</option>
                              </select>
                            </label>
                            <button className="secondary-button" type="submit">Save</button>
                          </form>
                          <form action={resolveBlockerAction} className="admin-form">
                            <input type="hidden" name="projectId" value={id} />
                            <input type="hidden" name="blockerId" value={b.id} />
                            <label>Resolution note
                              <input name="resolutionNote" required placeholder="What unblocked it?" />
                            </label>
                            <button className="primary-button" type="submit">Resolve</button>
                          </form>
                        </details>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {canManage ? (
          <section className="surface-card admin-section" aria-labelledby="blk-add">
            <h2 id="blk-add">Raise a blocker</h2>
            <form action={raiseBlockerAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <div className="admin-form-row">
                <label>Title <input name="title" required /></label>
                <label>Severity
                  <select name="severity" defaultValue="medium">
                    <option>low</option><option>medium</option><option>high</option><option>critical</option>
                  </select>
                </label>
              </div>
              <label>Description <input name="description" /></label>
              <div className="admin-form-row">
                <label>Owner <input name="ownerName" /></label>
                <label>Due date <input type="date" name="dueDate" /></label>
                <label>Linked schedule item
                  <select name="scheduleItemId" defaultValue="">
                    <option value="">None</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </label>
              </div>
              <button className="primary-button" type="submit">Raise blocker</button>
            </form>
          </section>
        ) : null}

        <section className="surface-card admin-section" aria-labelledby="blk-resolved">
          <h2 id="blk-resolved">Resolved ({resolved.length})</h2>
          {resolved.length === 0 ? <p className="admin-empty">Nothing resolved yet.</p> : (
            <ul>
              {resolved.map((b) => (
                <li key={b.id}>
                  <strong>{b.title}</strong> — {b.resolutionNote}
                  {b.resolvedAt ? <small> ({b.resolvedAt.toISOString().slice(0, 10)})</small> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
