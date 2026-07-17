import Link from "next/link";
import { getDb } from "@/db/client";
import { currentContext } from "@/app/session";
import { listReports } from "@/db/queries/reports";
import { AppHeader } from "@/app/components/AppHeader";
import { StatusBadge } from "@/app/components/StatusBadge";

function formatReportDate(value: string): { day: string; month: string; full: string } {
  const date = new Date(`${value}T12:00:00`);
  return {
    day: new Intl.DateTimeFormat("en-IN", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("en-IN", { month: "short" }).format(date).toUpperCase(),
    full: new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date),
  };
}

export default async function ReportsPage() {
  const db = await getDb();
  const ctx = await currentContext();
  const reports = await listReports(db, ctx);
  const canCapture = ctx.capabilities.includes("report.create");
  const isManager = ctx.capabilities.includes("report.approve");
  const awaiting = reports.filter((report) => report.status === "AWAITING_REVIEW").length;
  const approved = reports.filter((report) => report.status === "APPROVED").length;
  const issued = reports.filter((report) => report.status === "ISSUED").length;
  const failures = reports.filter((report) => report.status === "PROCESSING_FAILED").length;
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <>
      <AppHeader
        roleLabel={isManager ? "Project Manager" : "Site Engineer"}
        canCapture={canCapture}
      />
      <main id="main-content" className="page-shell reports-page">
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
          <section className="manager-summary" aria-label="Report summary">
            <article className="metric-card metric-card--attention">
              <span className="metric-card__label">Needs review</span>
              <strong>{awaiting}</strong>
              <small>{awaiting === 1 ? "report waiting" : "reports waiting"}</small>
            </article>
            <article className="metric-card">
              <span className="metric-card__label">Approved</span>
              <strong>{approved}</strong>
              <small>ready to issue</small>
            </article>
            <article className="metric-card">
              <span className="metric-card__label">Issued</span>
              <strong>{issued}</strong>
              <small>finished DPRs</small>
            </article>
            <article className={`metric-card ${failures ? "metric-card--danger" : ""}`}>
              <span className="metric-card__label">Processing issues</span>
              <strong>{failures}</strong>
              <small>{failures ? "needs attention" : "all clear"}</small>
            </article>
          </section>
        ) : (
          <section className="field-hero-card">
            <div className="field-hero-card__status">
              <span className="field-hero-card__date">
                <small>TODAY</small>
                <strong>{new Intl.DateTimeFormat("en-IN", { day: "2-digit" }).format(new Date())}</strong>
              </span>
              <div>
                <p className="eyebrow">Sector 62 · Tower A</p>
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

        <section className="report-list-section">
          <div className="report-list-heading">
            <div>
              <p className="eyebrow">{isManager ? "Action queue" : "Project record"}</p>
              <h2 className="section-heading">
                {isManager ? "Reports requiring your attention" : "Recent daily reports"}
              </h2>
            </div>
            <span>{reports.length} total</span>
          </div>

          {reports.length > 0 ? (
            <ul className="report-list">
              {reports.map((report, index) => {
                const date = formatReportDate(report.reportDate);
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
                        <span>{date.full} · Sector 62, Tower A</span>
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
              <h3>No reports yet</h3>
              <p>Record the first site update. Your voice note and photos will become a review-ready DPR.</p>
              {canCapture && (
                <Link href="/capture" className="primary-button">
                  Record first update
                </Link>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
