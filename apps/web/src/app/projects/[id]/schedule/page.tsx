import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { listDependencies, listScheduleItems } from "@buildflow/db/queries/controls";
import { listReports } from "@buildflow/db/queries/reports";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import {
  addDependencyAction, createScheduleItemAction, recordProgressAction, reviseScheduleDatesAction,
} from "@/app/actions/controls";

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, items, deps, reports } = await withTenant(db, ctx, async (tx) => {
    const project = await getProject(tx, ctx, id);
    const [items, deps, reports] = await Promise.all([
      listScheduleItems(tx, ctx, id),
      listDependencies(tx, ctx, id),
      listReports(tx, ctx),
    ]);
    return { project, items, deps, reports };
  });
  const approvedReports = reports.filter((r) =>
    r.projectId === id && ["APPROVED", "ISSUED"].includes(r.status));
  const canManage = ctx.capabilities.includes("schedule.manage");
  const nameOf = (itemId: string) => items.find((i) => i.id === itemId)?.name ?? itemId;

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Schedule</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="schedule" />

        <section className="surface-card admin-section" aria-labelledby="sch-items">
          <h2 id="sch-items">Activities and milestones</h2>
          {items.length === 0 ? (
            <p className="admin-empty">No schedule items yet. Add the first activity below or import a CSV in Settings.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Baseline</th>
                  <th scope="col">Current</th>
                  <th scope="col">Progress</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Status</th>
                  {canManage ? <th scope="col">Update</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.isMilestone ? "◆ " : ""}{item.name}</td>
                    <td>{item.baselineStart ?? "—"} → {item.baselineEnd ?? "—"}</td>
                    <td>{item.currentStart ?? "—"} → {item.currentEnd ?? "—"}</td>
                    <td>{item.progressPercent}%</td>
                    <td>{item.ownerName ?? "—"}</td>
                    <td>{item.status}</td>
                    {canManage ? (
                      <td>
                        <details>
                          <summary>Edit</summary>
                          <form action={reviseScheduleDatesAction} className="admin-form">
                            <input type="hidden" name="projectId" value={id} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <label>Current start
                              <input type="date" name="currentStart" defaultValue={item.currentStart ?? ""} />
                            </label>
                            <label>Current end
                              <input type="date" name="currentEnd" defaultValue={item.currentEnd ?? ""} />
                            </label>
                            <label>Status
                              <select name="status" defaultValue={item.status}>
                                <option value="planned">planned</option>
                                <option value="in_progress">in progress</option>
                                <option value="on_hold">on hold</option>
                                <option value="complete">complete</option>
                              </select>
                            </label>
                            <label>Owner
                              <input name="ownerName" defaultValue={item.ownerName ?? ""} />
                            </label>
                            <button className="secondary-button" type="submit">Save dates</button>
                          </form>
                          <form action={recordProgressAction} className="admin-form">
                            <input type="hidden" name="projectId" value={id} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <label>Progress %
                              <input type="number" name="percent" min={0} max={100}
                                defaultValue={item.progressPercent} required />
                            </label>
                            <label>Evidence (approved report)
                              <select name="evidenceReportId" defaultValue="">
                                <option value="">No linked evidence</option>
                                {approvedReports.map((r) => (
                                  <option key={r.id} value={r.id}>{r.reportDate} — {r.status}</option>
                                ))}
                              </select>
                            </label>
                            <label>Note
                              <input name="note" placeholder="What was measured or observed?" />
                            </label>
                            <button className="primary-button" type="submit">Record progress</button>
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
          <section className="surface-card admin-section" aria-labelledby="sch-add">
            <h2 id="sch-add">Add activity or milestone</h2>
            <form action={createScheduleItemAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <div className="admin-form-row">
                <label>Name <input name="name" required /></label>
                <label>Owner <input name="ownerName" /></label>
              </div>
              <div className="admin-form-row">
                <label>Baseline start <input type="date" name="baselineStart" /></label>
                <label>Baseline end <input type="date" name="baselineEnd" /></label>
                <label className="admin-inline-form">
                  <input type="checkbox" name="isMilestone" /> Milestone
                </label>
              </div>
              <button className="primary-button" type="submit">Add item</button>
            </form>
          </section>
        ) : null}

        <section className="surface-card admin-section" aria-labelledby="sch-deps">
          <h2 id="sch-deps">Dependencies</h2>
          {deps.length === 0 ? <p className="admin-empty">No dependencies recorded.</p> : (
            <ul>
              {deps.map((d) => (
                <li key={d.id}>{nameOf(d.predecessorId)} → {nameOf(d.successorId)}</li>
              ))}
            </ul>
          )}
          {canManage && items.length >= 2 ? (
            <form action={addDependencyAction} className="admin-form admin-form--inline">
              <input type="hidden" name="projectId" value={id} />
              <label>Predecessor
                <select name="predecessorId" required>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </label>
              <label>Successor
                <select name="successorId" required>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </label>
              <button className="secondary-button" type="submit">Add dependency</button>
            </form>
          ) : null}
        </section>
      </main>
    </>
  );
}
