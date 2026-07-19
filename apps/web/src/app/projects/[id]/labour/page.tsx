import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { listContractors } from "@buildflow/db/queries/labour";
import { listActivities } from "@buildflow/db/queries/reference";
import { attendanceSummary, labourProductivity } from "@/core/labour-core";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import { recordAttendanceAction, registerContractorAction } from "@/app/actions/labour";

export default async function LabourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, contractors, activities, summary, productivity } = await withTenant(db, ctx, async (tx) => {
    const project = await getProject(tx, ctx, id);
    const [contractors, activities, summary, productivity] = await Promise.all([
      listContractors(tx, ctx, id),
      listActivities(tx, ctx, id),
      attendanceSummary(tx, ctx, id),
      labourProductivity(tx, ctx, id),
    ]);
    return { project, contractors, activities, summary, productivity };
  });
  const canManage = ctx.capabilities.includes("labour.manage");

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Labour</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="labour" />

        <section className="surface-card admin-section" aria-labelledby="lab-summary">
          <h2 id="lab-summary">Daily attendance totals</h2>
          <p className="page-lead">Contractor totals only — no individual worker identities, no biometrics.</p>
          {summary.length === 0 ? (
            <p className="admin-empty">No attendance recorded yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Total headcount</th>
                  <th scope="col">Hours</th>
                  <th scope="col">By trade</th>
                </tr>
              </thead>
              <tbody>
                {summary.slice(0, 14).map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.totalHeadcount}</td>
                    <td>{d.totalHours ?? "—"}</td>
                    <td>{d.byTrade.map((t) => `${t.trade} ${t.headcount}`).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canManage ? (
            <form action={recordAttendanceAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <div className="admin-form-row">
                <label>Date <input type="date" name="attendanceDate" required /></label>
                <label>Trade <input name="trade" placeholder="mason / helper / barbender" required /></label>
                <label>Headcount <input type="number" name="headcount" min={1} required /></label>
                <label>Hours worked <input name="hoursWorked" inputMode="decimal" /></label>
              </div>
              <div className="admin-form-row">
                <label>Contractor
                  <select name="contractorId" defaultValue="">
                    <option value="">—</option>
                    {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>Activity
                  <select name="activityId" defaultValue="">
                    <option value="">—</option>
                    {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label>Note <input name="note" /></label>
              </div>
              <button className="primary-button" type="submit">Record attendance</button>
            </form>
          ) : null}
        </section>

        <section className="surface-card admin-section" aria-labelledby="lab-productivity">
          <h2 id="lab-productivity">Productivity — attendance vs approved DPR quantities</h2>
          <p className="page-lead">
            A deterministic join per activity and day. Quantities come only from approved reports;
            nothing here is a score or a rating.
          </p>
          {productivity.length === 0 ? (
            <p className="admin-empty">Record attendance against an activity to see it beside approved DPR quantities.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Activity</th>
                  <th scope="col">Headcount</th>
                  <th scope="col">Hours</th>
                  <th scope="col">Approved quantities</th>
                </tr>
              </thead>
              <tbody>
                {productivity.map((row) => (
                  <tr key={`${row.date}|${row.activity}`}>
                    <td>{row.date}</td>
                    <td>{row.activity}</td>
                    <td>{row.headcount}</td>
                    <td>{row.hoursWorked ?? "—"}</td>
                    <td>
                      {row.approvedQuantities.length === 0 ? "No approved report quantity" :
                        row.approvedQuantities.map((q, i) => (
                          <span key={`${q.reportId}-${i}`}>
                            {i > 0 ? "; " : ""}
                            <Link href={`/reports/${q.reportId}`}>{q.value} {q.unit ?? ""} — {q.description}</Link>
                          </span>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="surface-card admin-section" aria-labelledby="lab-contractors">
          <h2 id="lab-contractors">Contractors</h2>
          {contractors.length === 0 ? (
            <p className="admin-empty">No contractors registered.</p>
          ) : (
            <ul>
              {contractors.map((c) => (
                <li key={c.id}>{c.name}{c.trade ? ` — ${c.trade}` : ""}{c.projectId ? "" : " (org-wide)"}</li>
              ))}
            </ul>
          )}
          {canManage ? (
            <details>
              <summary>Register contractor</summary>
              <form action={registerContractorAction} className="admin-form admin-form--inline">
                <input type="hidden" name="projectId" value={id} />
                <label>Name <input name="name" required /></label>
                <label>Trade <input name="trade" /></label>
                <button className="secondary-button" type="submit">Register</button>
              </form>
            </details>
          ) : null}
        </section>
      </main>
    </>
  );
}
