import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { listMbEntries } from "@buildflow/db/queries/mb";
import { listActivities, listLocations } from "@buildflow/db/queries/reference";
import { listContractors } from "@buildflow/db/queries/labour";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import { createMbEntryAction } from "@/app/actions/mb";

export default async function MbPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, entries, activities, locations, contractors } = await withTenant(db, ctx, async (tx) => {
    const project = await getProject(tx, ctx, id);
    const [entries, activities, locations, contractors] = await Promise.all([
      listMbEntries(tx, ctx, id),
      listActivities(tx, ctx, id),
      listLocations(tx, ctx, id),
      listContractors(tx, ctx, id),
    ]);
    return { project, entries, activities, locations, contractors };
  });
  const canCreate = ctx.capabilities.includes("mb.create");
  const numberOf = new Map(entries.map((e) => [e.id, e.mbNumber]));

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Measurement Book (e-MB Preview)</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="mb" />

        <section className="surface-card admin-section" aria-labelledby="mb-list">
          <h2 id="mb-list">Measurement Book (e-MB Preview) register</h2>
          <p className="page-lead">
            Digital preview only — not a legally authoritative Measurement Book. Quantities are
            server-computed from dimensions; certified entries are append-only.
          </p>
          <p>
            <a className="secondary-button" href={`/api/projects/${id}/mb/register`}>Download MB register CSV</a>{" "}
            <a className="secondary-button" href={`/api/projects/${id}/mb/ra-bill`}>Download RA-bill supporting statement</a>
          </p>
          {entries.length === 0 ? (
            <p className="admin-empty">No entries yet. Record the first measurement below.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">MB #</th>
                  <th scope="col">Date</th>
                  <th scope="col">Work item</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Formula</th>
                  <th scope="col">Status</th>
                  <th scope="col">Open</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>MB-{e.mbNumber}</td>
                    <td>{e.measurementDate}</td>
                    <td>{e.description}</td>
                    <td>{e.quantity} {e.unit}</td>
                    <td>{e.formula}</td>
                    <td>
                      {e.status}
                      {e.supersededBy ? ` (superseded by MB-${numberOf.get(e.supersededBy) ?? "?"})` : ""}
                      {e.correctsEntryId ? ` (corrects MB-${numberOf.get(e.correctsEntryId) ?? "?"})` : ""}
                    </td>
                    <td><Link href={`/projects/${id}/mb/${e.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {canCreate ? (
          <section className="surface-card admin-section" aria-labelledby="mb-add">
            <h2 id="mb-add">Record measurement</h2>
            <form action={createMbEntryAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <div className="admin-form-row">
                <label>Work item description <input name="description" required /></label>
                <label>Date <input type="date" name="measurementDate" required /></label>
                <label>Unit <input name="unit" placeholder="cum / sqm / m / nos" required /></label>
              </div>
              <div className="admin-form-row">
                <label>Length (L) <input name="length" inputMode="decimal" /></label>
                <label>Breadth (B) <input name="breadth" inputMode="decimal" /></label>
                <label>Depth (D) <input name="depth" inputMode="decimal" /></label>
                <label>Count (n) <input type="number" name="count" min={1} /></label>
              </div>
              <div className="admin-form-row">
                <label>Activity
                  <select name="activityId" defaultValue="">
                    <option value="">—</option>
                    {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label>Location
                  <select name="locationId" defaultValue="">
                    <option value="">—</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <label>Contractor
                  <select name="contractorId" defaultValue="">
                    <option value="">—</option>
                    {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              </div>
              <p className="muted-copy">
                Quantity is computed on the server as the product of the dimensions you provide
                (formula recorded, e.g. L×B×D×n). A mismatching client value is refused.
              </p>
              <button className="primary-button" type="submit">Save draft entry</button>
            </form>
          </section>
        ) : null}
      </main>
    </>
  );
}
