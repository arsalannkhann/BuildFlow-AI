import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { AppHeader } from "@/app/components/AppHeader";
import { listMembers } from "@buildflow/db/queries/members";
import { listInvitations } from "@buildflow/db/queries/invitations";
import { listAuditEvents } from "@buildflow/db/queries/audit";
import { ROLES } from "@buildflow/domain/tenancy";
import { inviteMemberAction, revokeInvitationAction } from "@/app/actions/admin";
import { InviteLinkNotice } from "@/app/components/InviteLinkNotice";

export default async function OrganizationPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const db = await getDb();
  const ctx = await currentContext();
  const canManageMembers = ctx.capabilities.includes("org.members.manage");
  const canReadAudit = ctx.capabilities.includes("org.audit.read");
  const members = await listMembers(db, ctx);
  const invitations = canManageMembers ? await listInvitations(db, ctx) : [];
  const auditRows = canReadAudit ? await listAuditEvents(db, ctx, 50) : [];
  const invitedToken = typeof params.invited === "string" ? params.invited : null;

  return (
    <>
      <AppHeader roleLabel="Organization" canCapture={false} />
      <main id="main-content" className="page-shell">
        <section className="reports-intro">
          <div>
            <p className="eyebrow">Administration</p>
            <h1 className="page-title">Organization</h1>
            <p className="page-lead">People, access and the audit trail for your organization.</p>
          </div>
        </section>

        {invitedToken && <InviteLinkNotice token={invitedToken} />}

        <section className="surface-card admin-section" aria-labelledby="org-members">
          <h2 id="org-members">Members</h2>
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Scope</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.membershipId}>
                  <td>{m.displayName}</td>
                  <td>{m.email ?? "—"}</td>
                  <td>{m.role ?? "custom"}</td>
                  <td>{m.projectId ? "Project" : "Organization"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {canManageMembers && (
          <section className="surface-card admin-section" aria-labelledby="org-invite">
            <h2 id="org-invite">Invite an organization member</h2>
            <form action={inviteMemberAction} className="admin-form">
              <label>Email<input name="email" type="email" /></label>
              <label>Mobile<input name="mobile" inputMode="tel" placeholder="+91…" /></label>
              <label>Role
                <select name="role" defaultValue="project_manager">
                  {ROLES.map((r) => <option key={r} value={r}>{r.replaceAll("_", " ")}</option>)}
                </select>
              </label>
              <button type="submit" className="primary-button">Create invitation</button>
            </form>

            {invitations.filter((i) => i.status === "pending").length > 0 && (
              <table className="admin-table">
                <thead><tr><th>Sent to</th><th>Role</th><th>Expires</th><th /></tr></thead>
                <tbody>
                  {invitations.filter((i) => i.status === "pending").map((i) => (
                    <tr key={i.id}>
                      <td>{i.email ?? i.mobile}</td>
                      <td>{i.role.replaceAll("_", " ")}</td>
                      <td>{i.expiresAt.toLocaleDateString("en-IN")}</td>
                      <td>
                        <form action={revokeInvitationAction}>
                          <input type="hidden" name="invitationId" value={i.id} />
                          <button type="submit" className="secondary-button">Revoke</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {canReadAudit && (
          <section className="surface-card admin-section" aria-labelledby="org-audit">
            <h2 id="org-audit">Recent audit events</h2>
            <table className="admin-table">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Subject</th></tr></thead>
              <tbody>
                {auditRows.map((e) => (
                  <tr key={e.id}>
                    <td>{e.createdAt.toLocaleString("en-IN")}</td>
                    <td>{e.actorId}</td>
                    <td>{e.action}</td>
                    <td className="admin-table__mono">{e.subjectRef}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </>
  );
}
