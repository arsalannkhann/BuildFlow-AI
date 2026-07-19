import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { projectOverview } from "@/core/controls-core";
import { shortageAlerts } from "@/core/materials-core";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import Link from "next/link";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, overview, shortages } = await withTenant(db, ctx, async (tx) => {
    const project = await getProject(tx, ctx, id);
    const overview = await projectOverview(tx, ctx, id);
    const shortages = await shortageAlerts(tx, ctx, id);
    return { project, overview, shortages };
  });
  const missingDays = overview.reporting.last7Days.filter((d) => !d.hasAny).length;

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Project overview</p>
        <h1 className="page-title">{project.name}</h1>
        {project.clientName ? <p className="page-lead">Client: {project.clientName}</p> : null}
        <ProjectNav projectId={id} active="" />

        <div className="overview-grid">
          <section className="surface-card admin-section" aria-labelledby="ov-reporting">
            <h2 id="ov-reporting">Reporting, last 7 days</h2>
            <ul className="report-days">
              {overview.reporting.last7Days.slice().reverse().map((d) => (
                <li key={d.date}
                  className={d.hasApproved ? "day--approved" : d.hasAny ? "day--submitted" : "day--missing"}
                  title={d.date}>
                  <span aria-hidden="true">{d.date.slice(8)}</span>
                  <span className="sr-only">
                    {d.date}: {d.hasApproved ? "approved" : d.hasAny ? "submitted" : "missing"}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              {missingDays === 0 ? "No missing days." : `${missingDays} day(s) without a report.`}{" "}
              {overview.reporting.awaitingReview > 0 ? `${overview.reporting.awaitingReview} awaiting review.` : ""}
              {overview.reporting.failures > 0 ? ` ${overview.reporting.failures} processing failure(s).` : ""}
            </p>
            <Link className="secondary-button" href="/reports">Open reports</Link>
          </section>

          <section className="surface-card admin-section" aria-labelledby="ov-blockers">
            <h2 id="ov-blockers">Unresolved blockers</h2>
            {Object.keys(overview.openBlockersBySeverity).length === 0 ? (
              <p className="admin-empty">No open blockers.</p>
            ) : (
              <ul>
                {(["critical", "high", "medium", "low"] as const)
                  .filter((s) => overview.openBlockersBySeverity[s])
                  .map((s) => (
                    <li key={s}>
                      <span className={`severity-chip severity-${s}`}>{s}</span>{" "}
                      {overview.openBlockersBySeverity[s]} open
                    </li>
                  ))}
              </ul>
            )}
            {overview.overdueBlockers.length > 0 ? (
              <p><strong>{overview.overdueBlockers.length}</strong> past their due date.</p>
            ) : null}
            <Link className="secondary-button" href={`/projects/${id}/blockers`}>Open blockers</Link>
          </section>

          <section className="surface-card admin-section" aria-labelledby="ov-shortages">
            <h2 id="ov-shortages">Material shortages</h2>
            {shortages.length === 0 ? (
              <p className="admin-empty">No material below its reorder threshold.</p>
            ) : (
              <ul>
                {shortages.map((s) => (
                  <li key={s.materialId}>
                    <Link href={`/projects/${id}/materials/${s.materialId}`}>{s.name}</Link>{" "}
                    — {s.currentStock} {s.unit} (reorder at {s.reorderThreshold})
                  </li>
                ))}
              </ul>
            )}
            <Link className="secondary-button" href={`/projects/${id}/materials`}>Open materials</Link>
          </section>

          <section className="surface-card admin-section" aria-labelledby="ov-milestones">
            <h2 id="ov-milestones">Milestones, next 30 days</h2>
            {overview.upcomingMilestones.length === 0 ? (
              <p className="admin-empty">No upcoming milestones.</p>
            ) : (
              <ul>
                {overview.upcomingMilestones.map((m) => (
                  <li key={m.id}>{m.name} — {m.currentEnd}</li>
                ))}
              </ul>
            )}
            <Link className="secondary-button" href={`/projects/${id}/schedule`}>Open schedule</Link>
          </section>
        </div>

        <section className="surface-card admin-section" aria-labelledby="ov-delays">
          <h2 id="ov-delays">Delay indicators</h2>
          <p className="page-lead">
            Derived only from approved records: current dates, open blockers and linked report
            evidence. Nothing here is a prediction.
          </p>
          {overview.delayIndicators.length === 0 ? (
            <p className="admin-empty">Nothing is past its current planned end date.</p>
          ) : (
            overview.delayIndicators.map((d) => (
              <div className="delay-indicator" key={d.scheduleItemId}>
                <strong>{d.name} — {d.daysLate} day(s) late</strong>
                <p>{d.explanation}</p>
              </div>
            ))
          )}
        </section>
      </main>
    </>
  );
}
