import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { AppHeader } from "@/app/components/AppHeader";
import { listMembers } from "@buildflow/db/queries/members";
import { listInvitations } from "@buildflow/db/queries/invitations";
import { listAuditEvents } from "@buildflow/db/queries/audit";
import { ROLES } from "@buildflow/domain/tenancy";
import { inviteMemberAction, revokeInvitationAction } from "@/app/actions/admin";
import { InviteLinkNotice } from "@/app/components/InviteLinkNotice";
import { ResetLinkNotice } from "@/app/components/ResetLinkNotice";
import { generateMemberResetLinkAction } from "@/app/actions/auth";
import Link from "next/link";
import { listOrganizationExports, organizationCommercialOverview } from "@buildflow/db/queries/organization";
import { PLAN_LIMITS } from "@buildflow/domain/entitlements";
import {
  approveOrganizationDeletionAction, cancelOrganizationDeletionAction,
  requestOrganizationDeletionAction, requestOrganizationExportAction,
  updateOrganizationSettingsAction,
} from "@/app/actions/admin";
import { formatProjectDate, formatProjectDateTime } from "@buildflow/domain/date-time";

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} ${units[unit]}`;
};

export default async function OrganizationPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const db = await getDb();
  const ctx = await currentContext();
  const canManageMembers = ctx.capabilities.includes("org.members.manage");
  const canManageOrganization = ctx.capabilities.includes("org.manage");
  const canExport = ctx.capabilities.includes("org.export");
  const canReadAudit = ctx.capabilities.includes("org.audit.read");
  const { members, commercial, exports, invitations, auditRows } = await withTenant(db, ctx, async (tx) => {
    const [members, commercial, exports] = await Promise.all([
      listMembers(tx, ctx), organizationCommercialOverview(tx, ctx),
      canExport ? listOrganizationExports(tx, ctx) : Promise.resolve([]),
    ]);
    const invitations = canManageMembers ? await listInvitations(tx, ctx) : [];
    const auditRows = canReadAudit ? await listAuditEvents(tx, ctx, 50) : [];
    return { members, commercial, exports, invitations, auditRows };
  });
  const invitedToken = typeof params.invited === "string" ? params.invited : null;
  const resetToken = typeof params.resetToken === "string" ? params.resetToken : null;

  return (
    <>
      <AppHeader roleLabel="Organization" canCapture={false} />
      <main id="main-content" className="page-shell">
        <section className="reports-intro">
          <div>
            <p className="eyebrow">Administration</p>
            <h1 className="page-title">Organization</h1>
            <p className="page-lead">People, plan usage, data controls and the audit trail for your organization.</p>
            <div className="intro-actions">
              {canManageOrganization ? <Link className="secondary-button" href="/onboarding">Workspace setup</Link> : null}
              {canReadAudit ? <Link className="secondary-button" href="/organization/health">Provider and job health</Link> : null}
            </div>
          </div>
        </section>

        {invitedToken && <InviteLinkNotice token={invitedToken} />}
        {resetToken && <ResetLinkNotice token={resetToken} />}

        <section className="surface-card admin-section" aria-labelledby="org-plan">
          <div className="admin-section__heading">
            <div><h2 id="org-plan">Plan and usage</h2><p>Manual billing state and live meters from organization records.</p></div>
            <span className="status-pill">{commercial.organization.plan}</span>
          </div>
          <div className="usage-grid">
            {([
              ["Projects", commercial.usage.projects, PLAN_LIMITS[commercial.organization.plan].projects],
              ["Active users", commercial.usage.users, PLAN_LIMITS[commercial.organization.plan].users],
              ["Storage", formatBytes(commercial.usage.storageBytes), PLAN_LIMITS[commercial.organization.plan].storageBytes === null ? null : formatBytes(PLAN_LIMITS[commercial.organization.plan].storageBytes!)],
              ["AI runs this month", commercial.usage.aiRunsThisMonth, PLAN_LIMITS[commercial.organization.plan].aiRunsThisMonth],
            ] as const).map(([label, value, limit]) => (
              <article className="usage-card" key={label}>
                <span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</strong>
                <small>{limit === null ? "No plan limit" : `of ${typeof limit === "number" ? limit.toLocaleString("en-IN") : limit}`}</small>
              </article>
            ))}
          </div>
          <p className="admin-note">Billing: <strong>{commercial.organization.billingStatus.replaceAll("_", " ")}</strong>. Limits are enforced when creating projects or inviting users; existing records remain accessible.</p>
          {canManageOrganization ? (
            <form action={updateOrganizationSettingsAction} className="admin-form admin-form--three">
              <label>Plan<select name="plan" defaultValue={commercial.organization.plan}>
                <option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option>
              </select></label>
              <label>Billing status<select name="billingStatus" defaultValue={commercial.organization.billingStatus}>
                <option value="trial">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="paused">Paused</option>
              </select></label>
              <label>Retention days<input name="retentionDays" type="number" min="30" max="3650" defaultValue={commercial.organization.retentionDays ?? ""} placeholder="Retain until configured" /></label>
              <button type="submit" className="primary-button">Save organization settings</button>
            </form>
          ) : null}
        </section>

        {canExport ? (
          <section className="surface-card admin-section" aria-labelledby="org-export">
            <div className="admin-section__heading">
              <div><h2 id="org-export">Organization exports</h2><p>Downloadable ZIP registers and an attachment manifest. Files are prepared in the background.</p></div>
              <form action={requestOrganizationExportAction}><button className="primary-button" type="submit">Prepare new export</button></form>
            </div>
            {exports.length === 0 ? <p className="empty-copy">No exports have been requested.</p> : (
              <div className="table-scroll"><table className="admin-table">
                <thead><tr><th>Requested</th><th>Status</th><th>Size</th><th>Download</th></tr></thead>
                <tbody>{exports.map((item) => <tr key={item.id}>
                  <td>{formatProjectDateTime(item.createdAt)}</td><td>{item.status}</td>
                  <td>{item.byteSize ? formatBytes(item.byteSize) : "—"}</td>
                  <td>{item.status === "succeeded" ? <a className="secondary-button" href={`/api/organization/exports/${item.id}`}>Download ZIP</a> : item.errorCategory ?? "Processing"}</td>
                </tr>)}</tbody>
              </table></div>
            )}
          </section>
        ) : null}

        {canManageOrganization ? (
          <section className="surface-card admin-section danger-zone" aria-labelledby="org-deletion">
            <h2 id="org-deletion">Organization deletion</h2>
            {!commercial.organization.deletionRequestedAt ? (
              <>
                <p>Deletion requires another owner’s approval and waits seven days. You can cancel it during the grace period.</p>
                <form action={requestOrganizationDeletionAction} className="admin-form">
                  <label>Type <strong>{commercial.organization.name}</strong> to continue
                    <input name="organizationName" autoComplete="off" required />
                  </label>
                  <button type="submit" className="danger-button">Request deletion</button>
                </form>
              </>
            ) : (
              <div className="deletion-state">
                <p>Requested {formatProjectDateTime(commercial.organization.deletionRequestedAt)}. Earliest execution: <strong>{commercial.organization.deletionExecuteAfter ? formatProjectDateTime(commercial.organization.deletionExecuteAfter) : "—"}</strong>.</p>
                {commercial.organization.deletionApprovedAt ? (
                  <p>Approved by a second owner. The deletion job remains cancellable until execution.</p>
                ) : commercial.organization.deletionRequestedBy === ctx.userId ? (
                  <p>Waiting for a different organization owner to approve.</p>
                ) : (
                  <form action={approveOrganizationDeletionAction}><button type="submit" className="danger-button">Approve deletion as second owner</button></form>
                )}
                <form action={cancelOrganizationDeletionAction}><button type="submit" className="secondary-button">Cancel deletion</button></form>
              </div>
            )}
          </section>
        ) : null}

        <section className="surface-card admin-section" aria-labelledby="org-members">
          <h2 id="org-members">Members</h2>
          <div className="table-scroll" tabIndex={0} aria-label="Organization members table">
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Scope</th>{canManageMembers ? <th><span className="sr-only">Actions</span></th> : null}</tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.membershipId}>
                  <td>{m.displayName}</td>
                  <td>{m.email ?? "—"}</td>
                  <td>{m.role ?? "custom"}</td>
                  <td>{m.projectId ? "Project" : "Organization"}</td>
                  {canManageMembers ? (
                    <td>
                      <form action={generateMemberResetLinkAction}>
                        <input type="hidden" name="userId" value={m.userId} />
                        <button type="submit" className="secondary-button">Reset link</button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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
              <div className="table-scroll" tabIndex={0} aria-label="Pending invitations table">
              <table className="admin-table">
                <thead><tr><th>Sent to</th><th>Role</th><th>Expires</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {invitations.filter((i) => i.status === "pending").map((i) => (
                    <tr key={i.id}>
                      <td>{i.email ?? i.mobile}</td>
                      <td>{i.role.replaceAll("_", " ")}</td>
                      <td>{formatProjectDate(i.expiresAt)}</td>
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
              </div>
            )}
          </section>
        )}

        {canReadAudit && (
          <section className="surface-card admin-section" aria-labelledby="org-audit">
            <h2 id="org-audit">Recent audit events</h2>
            <div className="table-scroll" tabIndex={0} aria-label="Recent organization audit events table">
            <table className="admin-table">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Subject</th></tr></thead>
              <tbody>
                {auditRows.map((e) => (
                  <tr key={e.id}>
                    <td>{formatProjectDateTime(e.createdAt)}</td>
                    <td>{e.actorId}</td>
                    <td>{e.action}</td>
                    <td className="admin-table__mono">{e.subjectRef}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
