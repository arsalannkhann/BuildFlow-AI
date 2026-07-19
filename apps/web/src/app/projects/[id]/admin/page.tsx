import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { AppHeader } from "@/app/components/AppHeader";
import { getProject } from "@buildflow/db/queries/projects";
import { listActivities, listLocations } from "@buildflow/db/queries/reference";
import { listMembers } from "@buildflow/db/queries/members";
import { listInvitations } from "@buildflow/db/queries/invitations";
import { ROLES } from "@buildflow/domain/tenancy";
import {
  addActivityAction, addLocationAction, changeRoleAction, importCsvAction,
  inviteMemberAction, removeMemberAction, revokeInvitationAction, updateProjectAction,
} from "@/app/actions/admin";
import { InviteLinkNotice } from "@/app/components/InviteLinkNotice";
import { LOCATION_KINDS } from "@/core/admin-core";

export default async function ProjectAdminPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const project = await withTenant(db, ctx, (tx) => getProject(tx, ctx, id));
  const canManage = ctx.capabilities.includes("project.manage");
  const canMembers = ctx.capabilities.includes("project.members.manage");
  const [locationRows, activityRows, members, invitations] = await withTenant(db, ctx, (tx) => Promise.all([
    listLocations(tx, ctx, id), listActivities(tx, ctx, id),
    listMembers(tx, ctx, id),
    canMembers ? listInvitations(tx, ctx, id) : Promise.resolve([]),
  ]));
  const locationName = new Map(locationRows.map((l) => [l.id, l.name]));
  const invitedToken = typeof query.invited === "string" ? query.invited : null;

  return (
    <>
      <AppHeader roleLabel={project.name} canCapture={false} />
      <main id="main-content" className="page-shell">
        <section className="reports-intro">
          <div>
            <p className="eyebrow">Project settings</p>
            <h1 className="page-title">{project.name}</h1>
            <p className="page-lead">{project.clientName ?? "No client set"} · {project.timezone}</p>
          </div>
        </section>

        {invitedToken && <InviteLinkNotice token={invitedToken} />}

        {canManage && (
          <section className="surface-card admin-section" aria-labelledby="ps-settings">
            <h2 id="ps-settings">Settings</h2>
            <form action={updateProjectAction} className="admin-form">
              <input type="hidden" name="projectId" value={project.id} />
              <label>Name<input name="name" defaultValue={project.name} required /></label>
              <label>Client<input name="clientName" defaultValue={project.clientName ?? ""} /></label>
              <label>Timezone<input name="timezone" defaultValue={project.timezone} /></label>
              <label>Address<input name="address" defaultValue={project.address ?? ""} /></label>
              <label>Report cutoff (HH:MM)<input name="reportCutoff" defaultValue={project.reportCutoff ?? ""} placeholder="18:00" /></label>
              <label>Latitude<input name="latitude" inputMode="decimal" defaultValue={project.latitude ?? ""} /></label>
              <label>Longitude<input name="longitude" inputMode="decimal" defaultValue={project.longitude ?? ""} /></label>
              <label>Default recipients (comma-separated emails)
                <input name="defaultRecipients" defaultValue={(project.defaultRecipients ?? []).join(", ")} />
              </label>
              <button type="submit" className="primary-button">Save settings</button>
            </form>
          </section>
        )}

        <section className="surface-card admin-section" aria-labelledby="ps-locations">
          <h2 id="ps-locations">Locations</h2>
          {locationRows.length > 0 ? (
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Kind</th><th>Parent</th></tr></thead>
              <tbody>
                {locationRows.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td><td>{l.kind}</td>
                    <td>{l.parentId ? locationName.get(l.parentId) ?? "—" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-empty">No locations yet. Add one or import a CSV (columns: name, kind, parent).</p>}
          {canManage && (
            <div className="admin-form-row">
              <form action={addLocationAction} className="admin-form admin-form--inline">
                <input type="hidden" name="projectId" value={project.id} />
                <label>Name<input name="name" required /></label>
                <label>Kind
                  <select name="kind">
                    {LOCATION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
                <label>Parent
                  <select name="parentId" defaultValue="">
                    <option value="">(top level)</option>
                    {locationRows.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <button type="submit" className="secondary-button">Add location</button>
              </form>
              <form action={importCsvAction} className="admin-form admin-form--inline">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="kind" value="locations" />
                <label>Import CSV<input type="file" name="file" accept=".csv,text/csv" required /></label>
                <button type="submit" className="secondary-button">Import locations</button>
              </form>
            </div>
          )}
        </section>

        <section className="surface-card admin-section" aria-labelledby="ps-activities">
          <h2 id="ps-activities">Activities</h2>
          {activityRows.length > 0 ? (
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Unit</th><th>Location</th></tr></thead>
              <tbody>
                {activityRows.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td><td>{a.unit ?? "—"}</td>
                    <td>{a.locationId ? locationName.get(a.locationId) ?? "—" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-empty">No activities yet. Add one or import a CSV (columns: name, unit, location).</p>}
          {canManage && (
            <div className="admin-form-row">
              <form action={addActivityAction} className="admin-form admin-form--inline">
                <input type="hidden" name="projectId" value={project.id} />
                <label>Name<input name="name" required /></label>
                <label>Unit<input name="unit" placeholder="sqm" /></label>
                <label>Location
                  <select name="locationId" defaultValue="">
                    <option value="">(none)</option>
                    {locationRows.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <button type="submit" className="secondary-button">Add activity</button>
              </form>
              <form action={importCsvAction} className="admin-form admin-form--inline">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="kind" value="activities" />
                <label>Import CSV<input type="file" name="file" accept=".csv,text/csv" required /></label>
                <button type="submit" className="secondary-button">Import activities</button>
              </form>
            </div>
          )}
        </section>

        <section className="surface-card admin-section" aria-labelledby="ps-members">
          <h2 id="ps-members">Project members</h2>
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th>{canMembers && <th />}</tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.membershipId}>
                  <td>{m.displayName}</td>
                  <td>{m.email ?? "—"}</td>
                  <td>
                    {canMembers ? (
                      <form action={changeRoleAction} className="admin-inline-form">
                        <input type="hidden" name="userId" value={m.userId} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <select name="role" defaultValue={m.role ?? "site_engineer"}>
                          {ROLES.map((r) => <option key={r} value={r}>{r.replaceAll("_", " ")}</option>)}
                        </select>
                        <button type="submit" className="secondary-button">Change</button>
                      </form>
                    ) : (m.role ?? "custom")}
                  </td>
                  {canMembers && (
                    <td>
                      <form action={removeMemberAction}>
                        <input type="hidden" name="membershipId" value={m.membershipId} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <button type="submit" className="secondary-button">Remove</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {canMembers && (
            <>
              <h3>Invite to this project</h3>
              <form action={inviteMemberAction} className="admin-form admin-form--inline">
                <input type="hidden" name="projectId" value={project.id} />
                <label>Email<input name="email" type="email" /></label>
                <label>Mobile<input name="mobile" inputMode="tel" placeholder="+91…" /></label>
                <label>Role
                  <select name="role" defaultValue="site_engineer">
                    {ROLES.map((r) => <option key={r} value={r}>{r.replaceAll("_", " ")}</option>)}
                  </select>
                </label>
                <button type="submit" className="primary-button">Create invitation</button>
              </form>
              {invitations.filter((i) => i.status === "pending").map((i) => (
                <form key={i.id} action={revokeInvitationAction} className="admin-inline-form">
                  <span>{i.email ?? i.mobile} · {i.role.replaceAll("_", " ")} · expires {i.expiresAt.toLocaleDateString("en-IN")}</span>
                  <input type="hidden" name="invitationId" value={i.id} />
                  <input type="hidden" name="projectId" value={project.id} />
                  <button type="submit" className="secondary-button">Revoke</button>
                </form>
              ))}
            </>
          )}
        </section>
      </main>
    </>
  );
}
