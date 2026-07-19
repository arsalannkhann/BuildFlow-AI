import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { listProjects } from "@buildflow/db/queries/projects";
import { AppHeader } from "@/app/components/AppHeader";
import { runSearch, SEARCH_KINDS, type SearchKind } from "@/core/search-core";
import { rebuildSearchIndexAction } from "@/app/actions/search";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  report: "Daily report", invoice: "Invoice", receipt: "Challan", rfi: "RFI",
  blocker: "Blocker", mb_entry: "MB entry", document: "Drawing/Document",
};

export default async function SearchPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const kind = typeof params.kind === "string" && (SEARCH_KINDS as readonly string[]).includes(params.kind)
    ? (params.kind as SearchKind) : null;
  const projectId = typeof params.project === "string" && params.project ? params.project : null;
  const dateFrom = typeof params.from === "string" && params.from ? params.from : null;
  const dateTo = typeof params.to === "string" && params.to ? params.to : null;

  const db = await getDb();
  const ctx = await currentContext();
  const projects = await listProjects(db, ctx);
  const result = q ? await runSearch(db, ctx, { query: q, kind, projectId, dateFrom, dateTo }) : null;

  return (
    <>
      <AppHeader roleLabel="Member" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Search</p>
        <h1 className="page-title">Search project records</h1>

        <section className="surface-card admin-section" aria-labelledby="search-form">
          <h2 id="search-form">Find records you can access</h2>
          <form method="get" action="/search" className="admin-form">
            <div className="admin-form-row">
              <label>Query <input name="q" defaultValue={q} placeholder="cement delivery, RCC drawings, crane…" required /></label>
              <label>Kind
                <select name="kind" defaultValue={kind ?? ""}>
                  <option value="">All kinds</option>
                  {SEARCH_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                </select>
              </label>
              <label>Project
                <select name="project" defaultValue={projectId ?? ""}>
                  <option value="">All my projects</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>
            <div className="admin-form-row">
              <label>From <input type="date" name="from" defaultValue={dateFrom ?? ""} /></label>
              <label>To <input type="date" name="to" defaultValue={dateTo ?? ""} /></label>
              <button className="primary-button" type="submit">Search</button>
            </div>
          </form>
          {result && !result.semanticRankingActive ? (
            <p className="admin-empty">
              Lexical matches only — semantic ranking requires PostgreSQL (set DATABASE_URL).
            </p>
          ) : null}
        </section>

        {result ? (
          <section className="surface-card admin-section" aria-labelledby="search-results">
            <h2 id="search-results">{result.hits.length} result(s)</h2>
            {result.hits.length === 0 ? (
              <p className="admin-empty">No records match. Only records in your projects are searched.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Record</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Status</th>
                    <th scope="col">Date</th>
                    <th scope="col">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {result.hits.map((hit) => (
                    <tr key={hit.id}>
                      <td>
                        <Link href={hit.href}>{hit.title}</Link>
                        <div style={{ fontSize: "0.85em", opacity: 0.8 }}>
                          {hit.body.slice(0, 140)}{hit.body.length > 140 ? "…" : ""}
                        </div>
                      </td>
                      <td>{KIND_LABELS[hit.kind] ?? hit.kind}</td>
                      <td>
                        <span className={`status-badge ${hit.approved ? "status-badge--success" : "status-badge--warning"}`}>
                          <span className="status-badge__dot" aria-hidden="true" />
                          <span>{hit.approved ? `Approved record (${hit.recordStatus})` : `Working record (${hit.recordStatus})`}</span>
                        </span>
                      </td>
                      <td>{hit.recordDate ?? "—"}</td>
                      <td>{hit.semantic ? "semantic" : "keyword"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : null}

        {ctx.capabilities.includes("org.manage") ? (
          <section className="surface-card admin-section" aria-labelledby="search-admin">
            <h2 id="search-admin">Administration</h2>
            <p className="admin-empty">
              The search index is a rebuildable projection over approved reports, approved
              invoices, posted challans, certified MB entries, blockers, RFIs, and the
              document register.
            </p>
            <form action={rebuildSearchIndexAction}>
              <button className="secondary-button" type="submit">Rebuild search index</button>
            </form>
          </section>
        ) : null}
      </main>
    </>
  );
}
