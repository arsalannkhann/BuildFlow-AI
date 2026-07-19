import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { assertCan } from "@buildflow/domain/tenancy";
import {
  listOperationalJobs, listStuckProcessing, providerRunHealth,
} from "@buildflow/db/queries/operations";
import { currentContext } from "@/app/session";
import { AppHeader } from "@/app/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function ProviderHealthPage() {
  const db = await getDb();
  const ctx = await currentContext();
  try { assertCan(ctx, "org.audit.read"); } catch { notFound(); }
  const [jobs, stuck, providers] = await withTenant(db, ctx, (tx) => Promise.all([
    listOperationalJobs(tx, ctx), listStuckProcessing(tx, ctx), providerRunHealth(tx, ctx),
  ]));
  const dead = jobs.filter((job) => job.status === "dead").length;
  const retrying = jobs.filter((job) => job.status === "queued" && job.attempts > 0).length;

  return (
    <>
      <AppHeader roleLabel="Operations" />
      <main id="main-content" className="page-shell health-page">
        <Link href="/organization" className="compliance-back">← Organization</Link>
        <div className="health-heading">
          <div><h1 className="page-title">Provider and job health</h1><p>Operational metadata only. Report content and provider payloads are never shown here.</p></div>
          <span className={`health-signal ${dead || stuck.length ? "health-signal--attention" : "health-signal--healthy"}`}>
            {dead || stuck.length ? "Needs attention" : "Operating normally"}
          </span>
        </div>

        <section className="health-summary" aria-label="Operational summary">
          <div><strong>{dead}</strong><span>dead-letter jobs</span></div>
          <div><strong>{retrying}</strong><span>retrying jobs</span></div>
          <div><strong>{stuck.length}</strong><span>stuck reports</span></div>
          <div><strong>{providers.reduce((sum, item) => sum + item.failed, 0)}</strong><span>provider failures</span></div>
        </section>

        {stuck.length > 0 ? (
          <section className="health-section" aria-labelledby="stuck-heading">
            <div className="compliance-section-heading"><div><h2 id="stuck-heading">Stuck processing</h2><p>The worker sweeper moves these to a recoverable failure after 15 minutes.</p></div></div>
            <ul className="health-list">{stuck.map((report) => <li key={report.id}><Link href={`/reports/${report.id}`}>Report {report.reportDate}</Link><code>{report.id}</code><time>{report.updatedAt.toISOString()}</time></li>)}</ul>
          </section>
        ) : null}

        <section className="health-section" aria-labelledby="providers-heading">
          <div className="compliance-section-heading"><div><h2 id="providers-heading">AI processing</h2><p>Run counts and latency by configured provider and model.</p></div></div>
          {providers.length === 0 ? <p className="admin-empty">No processing runs recorded yet.</p> : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="AI provider health table">
              <table className="admin-table"><thead><tr><th scope="col">Provider</th><th scope="col">Model</th><th scope="col">Runs</th><th scope="col">Succeeded</th><th scope="col">Failed</th><th scope="col">Average</th></tr></thead>
                <tbody>{providers.map((item) => <tr key={`${item.provider}:${item.model}`}><td>{item.provider}</td><td><code>{item.model}</code></td><td>{item.total}</td><td>{item.succeeded}</td><td>{item.failed}</td><td>{item.averageDurationMs} ms</td></tr>)}</tbody></table>
            </div>
          )}
        </section>

        <section className="health-section" aria-labelledby="jobs-heading">
          <div className="compliance-section-heading"><div><h2 id="jobs-heading">Queue exceptions</h2><p>Payloads and raw error messages are intentionally excluded.</p></div></div>
          {jobs.length === 0 ? <p className="admin-empty">No queued, leased, retrying, or dead jobs.</p> : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Queue exception table">
              <table className="admin-table"><thead><tr><th scope="col">Job</th><th scope="col">Kind</th><th scope="col">Status</th><th scope="col">Attempts</th><th scope="col">Updated</th></tr></thead>
                <tbody>{jobs.map((job) => <tr key={job.id}><td><code>{job.id}</code></td><td>{job.kind}</td><td>{job.status}</td><td>{job.attempts}/{job.maxAttempts}</td><td>{job.updatedAt.toISOString()}</td></tr>)}</tbody></table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
