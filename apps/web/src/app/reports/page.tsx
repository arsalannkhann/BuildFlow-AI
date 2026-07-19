import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { listReports } from "@buildflow/db/queries/reports";
import { searchApprovedReports } from "@buildflow/db/queries/search";
import { AppHeader } from "@/app/components/AppHeader";
import { StatusBadge } from "@/app/components/StatusBadge";
import { listProjects } from "@buildflow/db/queries/projects";
import { formatProjectDate } from "@buildflow/domain/date-time";

function formatReportDate(value: string, timeZone: string): { day: string; month: string; full: string } {
  const date = new Date(`${value}T12:00:00.000Z`);
  return {
    day: new Intl.DateTimeFormat("en-IN", { day: "2-digit", timeZone }).format(date),
    month: new Intl.DateTimeFormat("en-IN", { month: "short", timeZone }).format(date),
    full: formatProjectDate(value, {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
}

export default async function ReportsPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const q = typeof params.q === "string" ? params.q : "";
  const statusFilter = typeof params.status === "string" ? params.status : "";
  const projectFilter = typeof params.project === "string" ? params.project : "";
  const db = await getDb();
  const ctx = await currentContext();
  const searchHits = q ? await withTenant(db, ctx, (tx) => searchApprovedReports(tx, ctx, q)) : null;
  const [reports, projects] = await withTenant(db, ctx, (tx) =>
    Promise.all([listReports(tx, ctx), listProjects(tx, ctx)]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const activeProject = (ctx.projectId ? projectById.get(ctx.projectId) : null) ?? projects[0];
  const activeTimezone = activeProject?.timezone ?? "Asia/Kolkata";
  const canCapture = ctx.capabilities.includes("report.create");
  const isManager = ctx.capabilities.includes("report.approve");
  const awaiting = reports.filter((report) => report.status === "AWAITING_REVIEW").length;
  const approved = reports.filter((report) => report.status === "APPROVED").length;
  const issued = reports.filter((report) => report.status === "ISSUED").length;
  const failures = reports.filter((report) => report.status === "PROCESSING_FAILED").length;

  // Action queue ordering: a reviewer opens this page to find work, not to browse history.
  // Failures first (inputs are safe but stuck), then drafts awaiting review, then approved
  // reports still to issue; everything already issued drops below.
  const ACTION_RANK: Record<string, number> = {
    PROCESSING_FAILED: 0, AWAITING_REVIEW: 1, REJECTED: 2, APPROVED: 3,
    PROCESSING: 4, UPLOADED: 4, SYNCING: 4,
  };
  const needsAction = (status: string) => (ACTION_RANK[status] ?? 9) <= 3;
  const FILTERS: Record<string, (status: string) => boolean> = {
    review: (s) => s === "AWAITING_REVIEW",
    approved: (s) => s === "APPROVED",
    issued: (s) => s === "ISSUED" || s === "SUPERSEDED",
    failed: (s) => s === "PROCESSING_FAILED",
  };
  const matchesFilter: ((status: string) => boolean) | undefined = FILTERS[statusFilter];
  const visibleReports = reports.filter((report) =>
    (!matchesFilter || matchesFilter(report.status)) &&
    (!projectFilter || report.projectId === projectFilter));
  const orderedReports = statusFilter
    ? visibleReports
    : [...visibleReports].sort((a, b) =>
        (ACTION_RANK[a.status] ?? 9) - (ACTION_RANK[b.status] ?? 9));
  const actionable = orderedReports.filter((r) => needsAction(r.status));
  const history = orderedReports.filter((r) => !needsAction(r.status));
  const filterHref = (next: { status?: string; project?: string }) => {
    const sp = new URLSearchParams();
    const status = next.status ?? statusFilter;
    const project = next.project ?? projectFilter;
    if (status) sp.set("status", status);
    if (project) sp.set("project", project);
    const qs = sp.toString();
    return qs ? `/reports?${qs}` : "/reports";
  };
  const FILTER_LABELS: Record<string, string> = {
    review: "awaiting review", approved: "approved, ready to issue",
    issued: "issued", failed: "processing failures",
  };
  const today = formatProjectDate(new Date(), {
    timeZone: activeTimezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: undefined,
  });

  return (
    <>
      <AppHeader
        roleLabel={isManager ? "Project Manager" : "Site Engineer"}
        canCapture={canCapture}
      />
      <main id="main-content" className="page-shell reports-page">
        <section className="reports-search" aria-label="Search approved reports">
          <form method="get" className="reports-search__form">
            <label className="sr-only" htmlFor="report-search">Search approved reports</label>
            <input
              id="report-search" name="q" type="search" defaultValue={q}
              placeholder="Search approved reports and transcripts…" className="text-field"
            />
            <button type="submit" className="secondary-button">Search</button>
          </form>
          {searchHits !== null && (
            <div className="surface-card admin-section">
              <h2>{searchHits.length} result{searchHits.length === 1 ? "" : "s"} for “{q}”</h2>
              {searchHits.length === 0 && (
                <p className="admin-empty">No approved report matches. Drafts are not searchable.</p>
              )}
              <ul className="admin-list">
                {searchHits.map((hit) => (
                  <li key={hit.reportId} className="admin-list__row">
                    <div>
                      <strong>
                        <Link href={`/reports/${hit.reportId}`}>{hit.reportDate}</Link>
                      </strong>
                      <small>{hit.summary?.slice(0, 160) ?? ""}</small>
                    </div>
                    <StatusBadge status={hit.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="reports-intro">
          <div>
            <p className="eyebrow">{today}</p>
            <h1 className="page-title">
              {isManager ? "Project reports at a glance." : "Ready for today’s update?"}
            </h1>
            <p className="page-lead">
              {isManager
                ? "Review what needs your attention, then move approved reports forward."
                : "Speak naturally, attach the day’s photos and let BuildFlow prepare the draft."}
            </p>
          </div>
          {canCapture && (
            <Link href="/capture" className="primary-button reports-intro__action">
              <span className="button-record-dot" aria-hidden="true" />
              Record update
            </Link>
          )}
        </section>

        {isManager ? (
          <section className="manager-summary" aria-label="Filter reports by status">
            <Link href={filterHref({ status: statusFilter === "review" ? "" : "review" })}
              aria-current={statusFilter === "review" ? "true" : undefined}
              className={`metric-card metric-card--attention${statusFilter === "review" ? " metric-card--selected" : ""}`}>
              <span className="metric-card__label">Needs review</span>
              <strong>{awaiting}</strong>
              <small>{awaiting === 1 ? "report waiting" : "reports waiting"}</small>
            </Link>
            <Link href={filterHref({ status: statusFilter === "approved" ? "" : "approved" })}
              aria-current={statusFilter === "approved" ? "true" : undefined}
              className={`metric-card${statusFilter === "approved" ? " metric-card--selected" : ""}`}>
              <span className="metric-card__label">Approved</span>
              <strong>{approved}</strong>
              <small>ready to issue</small>
            </Link>
            <Link href={filterHref({ status: statusFilter === "issued" ? "" : "issued" })}
              aria-current={statusFilter === "issued" ? "true" : undefined}
              className={`metric-card${statusFilter === "issued" ? " metric-card--selected" : ""}`}>
              <span className="metric-card__label">Issued</span>
              <strong>{issued}</strong>
              <small>finished DPRs</small>
            </Link>
            <Link href={filterHref({ status: statusFilter === "failed" ? "" : "failed" })}
              aria-current={statusFilter === "failed" ? "true" : undefined}
              className={`metric-card${failures ? " metric-card--danger" : ""}${statusFilter === "failed" ? " metric-card--selected" : ""}`}>
              <span className="metric-card__label">Processing issues</span>
              <strong>{failures}</strong>
              <small>{failures ? "needs attention" : "all clear"}</small>
            </Link>
          </section>
        ) : (
          <section className="field-hero-card">
            <div className="field-hero-card__status">
              <span className="field-hero-card__date">
                <small>TODAY</small>
                <strong>{new Intl.DateTimeFormat("en-IN", { day: "2-digit", timeZone: activeTimezone }).format(new Date())}</strong>
              </span>
              <div>
                <p className="eyebrow">{activeProject?.name ?? "Active project"}</p>
                <h2>{reports[0] ? "Your latest update is on record." : "No update submitted yet."}</h2>
                <p>
                  {reports[0]
                    ? "You can open the report below or record a fresh site update."
                    : "A 60-second voice note is enough to begin."}
                </p>
              </div>
            </div>
            <Link href="/capture" className="field-record-action">
              <span className="field-record-action__orb" aria-hidden="true">
                <span className="css-microphone" />
              </span>
              <span>
                <strong>Record today&apos;s update</strong>
                <small>Voice note · Photos · Submit</small>
              </span>
              <span className="field-record-action__arrow" aria-hidden="true">→</span>
            </Link>
          </section>
        )}

        {(statusFilter || projectFilter) && (
          <p className="filter-notice" role="status">
            Showing <strong>{orderedReports.length}</strong>{" "}
            report{orderedReports.length === 1 ? "" : "s"}
            {statusFilter ? ` ${FILTER_LABELS[statusFilter] ?? "matching"}` : ""}
            {projectFilter ? ` in ${projectById.get(projectFilter)?.name ?? "this project"}` : ""}.{" "}
            <Link href="/reports">Clear filter</Link>
          </p>
        )}

        {projects.length > 1 && (
          <nav className="project-filter" aria-label="Filter by project">
            <Link href={filterHref({ project: "" })}
              aria-current={projectFilter ? undefined : "true"}
              className={projectFilter ? "project-filter__chip" : "project-filter__chip project-filter__chip--active"}>
              All projects
            </Link>
            {projects.map((project) => (
              <Link key={project.id}
                href={filterHref({ project: projectFilter === project.id ? "" : project.id })}
                aria-current={projectFilter === project.id ? "true" : undefined}
                className={projectFilter === project.id
                  ? "project-filter__chip project-filter__chip--active" : "project-filter__chip"}>
                {project.name}
              </Link>
            ))}
          </nav>
        )}

        {isManager && actionable.length > 0 && !statusFilter && (
          <section className="report-list-section">
            <div className="report-list-heading">
              <div>
                <p className="eyebrow">Action queue</p>
                <h2 className="section-heading">Waiting for you</h2>
              </div>
              <span>{actionable.length} to act on</span>
            </div>
            <ul className="report-list">
              {actionable.map((report) => {
                const project = projectById.get(report.projectId);
                const date = formatReportDate(report.reportDate, project?.timezone ?? activeTimezone);
                return (
                  <li key={report.id}>
                    <Link href={`/reports/${report.id}`} className="report-row report-row--action">
                      <span className="report-row__date" aria-label={date.full}>
                        <strong>{date.day}</strong>
                        <small>{date.month}</small>
                      </span>
                      <span className="report-row__main">
                        <span className="report-row__topline">
                          <strong>Daily Progress Report</strong>
                        </span>
                        <span>{date.full} · {project?.name ?? "Project"}</span>
                      </span>
                      <StatusBadge status={report.status} />
                      <span className="report-row__arrow" aria-hidden="true">→</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="report-list-section">
          <div className="report-list-heading">
            <div>
              <p className="eyebrow">{isManager ? "Project record" : "Project record"}</p>
              <h2 className="section-heading">
                {statusFilter || projectFilter
                  ? "Filtered reports"
                  : isManager && actionable.length > 0
                    ? "Everything else"
                    : "Recent daily reports"}
              </h2>
            </div>
            <span>{(statusFilter ? orderedReports : history).length} shown</span>
          </div>

          {(statusFilter ? orderedReports : history).length > 0 ? (
            <ul className="report-list">
              {(statusFilter ? orderedReports : history).map((report, index) => {
                const project = projectById.get(report.projectId);
                const date = formatReportDate(report.reportDate, project?.timezone ?? activeTimezone);
                return (
                  <li key={report.id}>
                    <Link href={`/reports/${report.id}`} className="report-row">
                      <span className="report-row__date" aria-label={date.full}>
                        <strong>{date.day}</strong>
                        <small>{date.month}</small>
                      </span>
                      <span className="report-row__main">
                        <span className="report-row__topline">
                          <strong>Daily Progress Report</strong>
                          {index === 0 && <em>Latest</em>}
                        </span>
                        <span>{date.full} · {project?.name ?? "Project"}</span>
                      </span>
                      <StatusBadge status={report.status} />
                      <span className="report-row__arrow" aria-hidden="true">→</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="reports-empty surface-card">
              <span className="reports-empty__graphic" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <h3>{statusFilter || projectFilter ? "Nothing matches this filter" : "No reports yet"}</h3>
              <p>
                {statusFilter || projectFilter
                  ? "Try a different status or project, or clear the filter to see the full record."
                  : "Record the first site update. Your voice note and photos will become a review-ready DPR."}
              </p>
              {statusFilter || projectFilter ? (
                <Link href="/reports" className="secondary-button">Clear filter</Link>
              ) : canCapture ? (
                <Link href="/capture" className="primary-button">Record first update</Link>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
