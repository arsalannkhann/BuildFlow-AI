import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { formatINR } from "@buildflow/domain/money";
import { currentContext } from "@/app/session";
import { AppHeader } from "@/app/components/AppHeader";
import { portfolioOverview } from "@/core/portfolio-core";

export const dynamic = "force-dynamic";

// Exception-first: lead with what needs attention; every number links to the page where
// its records live (design.md §9 — no unexplained metrics, no prediction).
export default async function PortfolioPage() {
  const db = await getDb();
  const ctx = await currentContext();
  const portfolio = await portfolioOverview(db, ctx);
  const { totals, jobs } = portfolio;

  return (
    <>
      <AppHeader roleLabel="Portfolio" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Portfolio</p>
        <h1 className="page-title">Across your projects</h1>

        <section className="surface-card admin-section" aria-labelledby="pf-exceptions">
          <h2 id="pf-exceptions">Needs attention now</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Exception</th>
                <th scope="col">Count</th>
                <th scope="col">Where</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Projects with no report today</td>
                <td>{totals.missingToday}</td>
                <td>{portfolio.projects.filter((p) => p.missingToday).map((p) => (
                  <Link key={p.project.id} href={`/projects/${p.project.id}`}>{p.project.name}</Link>
                )).length === 0 ? "—" : portfolio.projects.filter((p) => p.missingToday).map((p, i) => (
                  <span key={p.project.id}>{i > 0 ? " · " : ""}<Link href={`/projects/${p.project.id}`}>{p.project.name}</Link></span>
                ))}</td>
              </tr>
              <tr>
                <td>Reports awaiting review</td>
                <td><Link href="/reports">{totals.awaitingReview}</Link></td>
                <td><Link href="/reports">Review inbox</Link></td>
              </tr>
              <tr>
                <td>Report processing failures</td>
                <td><Link href="/reports">{totals.processingFailures}</Link></td>
                <td><Link href="/reports">Review inbox</Link></td>
              </tr>
              <tr>
                <td>Schedule items with delay indicators</td>
                <td>{totals.delayed}</td>
                <td>{portfolio.projects.filter((p) => p.delayIndicators.length > 0).map((p, i) => (
                  <span key={p.project.id}>{i > 0 ? " · " : ""}
                    <Link href={`/projects/${p.project.id}`}>{p.project.name} ({p.delayIndicators.length})</Link>
                  </span>
                ))}{totals.delayed === 0 ? "—" : null}</td>
              </tr>
              <tr>
                <td>Critical open blockers</td>
                <td>{totals.criticalOpenBlockers}</td>
                <td>{portfolio.projects.filter((p) => p.criticalOpenBlockers > 0).map((p, i) => (
                  <span key={p.project.id}>{i > 0 ? " · " : ""}
                    <Link href={`/projects/${p.project.id}/blockers`}>{p.project.name} ({p.criticalOpenBlockers})</Link>
                  </span>
                ))}{totals.criticalOpenBlockers === 0 ? "—" : null}</td>
              </tr>
              <tr>
                <td>Overdue blockers</td>
                <td>{totals.overdueBlockers}</td>
                <td>{portfolio.projects.filter((p) => p.overdueBlockers > 0).map((p, i) => (
                  <span key={p.project.id}>{i > 0 ? " · " : ""}
                    <Link href={`/projects/${p.project.id}/blockers`}>{p.project.name} ({p.overdueBlockers})</Link>
                  </span>
                ))}{totals.overdueBlockers === 0 ? "—" : null}</td>
              </tr>
              <tr>
                <td>Material shortage alerts</td>
                <td>{totals.shortages}</td>
                <td>{portfolio.projects.filter((p) => p.shortages.length > 0).map((p, i) => (
                  <span key={p.project.id}>{i > 0 ? " · " : ""}
                    <Link href={`/projects/${p.project.id}/materials`}>{p.project.name} ({p.shortages.length})</Link>
                  </span>
                ))}{totals.shortages === 0 ? "—" : null}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="surface-card admin-section" aria-labelledby="pf-pending">
          <h2 id="pf-pending">Pending approvals and verifications</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Invoices awaiting review</th>
                <th scope="col">PO drafts awaiting approval</th>
                <th scope="col">MB entries awaiting verification</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.projects.map((p) => (
                <tr key={p.project.id}>
                  <td><Link href={`/projects/${p.project.id}`}>{p.project.name}</Link></td>
                  <td><Link href={`/projects/${p.project.id}/budget`}>{p.invoicesPending}</Link></td>
                  <td><Link href={`/projects/${p.project.id}/procurement`}>{p.poDraftsAwaitingApproval}</Link></td>
                  <td><Link href={`/projects/${p.project.id}/mb`}>{p.mbAwaitingVerification}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {portfolio.canSeeBudget && totals.budget ? (
          <section className="surface-card admin-section" aria-labelledby="pf-budget">
            <h2 id="pf-budget">Budget vs actual vs committed (org rollup)</h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Budget</th>
                  <th scope="col">Actual</th>
                  <th scope="col">Committed</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.projects.map((p) => p.budget ? (
                  <tr key={p.project.id}>
                    <td><Link href={`/projects/${p.project.id}/budget`}>{p.project.name}</Link></td>
                    <td>{formatINR(p.budget.budgetPaise)}</td>
                    <td>{formatINR(p.budget.actualPaise)}</td>
                    <td>{formatINR(p.budget.committedPaise)}</td>
                  </tr>
                ) : null)}
                <tr>
                  <td><strong>Total</strong></td>
                  <td><strong>{formatINR(totals.budget.budgetPaise)}</strong></td>
                  <td><strong>{formatINR(totals.budget.actualPaise)}</strong></td>
                  <td><strong>{formatINR(totals.budget.committedPaise)}</strong></td>
                </tr>
              </tbody>
            </table>
          </section>
        ) : null}

        <section className="surface-card admin-section" aria-labelledby="pf-adoption">
          <h2 id="pf-adoption">Adoption and processing reliability</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Days reported (last 7)</th>
                <th scope="col">Days approved (last 7)</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.projects.map((p) => (
                <tr key={p.project.id}>
                  <td><Link href={`/projects/${p.project.id}`}>{p.project.name}</Link></td>
                  <td><Link href="/reports">{p.reportedDays7}/7</Link></td>
                  <td><Link href="/reports">{p.approvedDays7}/7</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Background processing: {jobs.succeeded} succeeded · {jobs.queued} queued ·{" "}
            <Link href="/reports">{jobs.retrying} retrying</Link> ·{" "}
            <Link href="/reports">{jobs.dead} dead-lettered</Link>
            {" "}(failed reports appear in the review inbox for retry or manual draft).
          </p>
        </section>
      </main>
    </>
  );
}
