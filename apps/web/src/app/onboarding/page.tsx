import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { listProjects } from "@buildflow/db/queries/projects";
import { listMembers } from "@buildflow/db/queries/members";
import { getOrganizationSettings } from "@buildflow/db/queries/organization";
import { ROLES } from "@buildflow/domain/tenancy";
import { currentContext } from "@/app/session";
import { AppHeader } from "@/app/components/AppHeader";
import { InviteLinkNotice } from "@/app/components/InviteLinkNotice";
import { createOnboardingProjectAction, inviteOnboardingMemberAction } from "@/app/actions/admin";

export default async function OnboardingPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const db = await getDb();
  const ctx = await currentContext();
  const [organization, projects, members] = await Promise.all([
    getOrganizationSettings(db, ctx.organizationId), listProjects(db, ctx), listMembers(db, ctx),
  ]);
  const canManage = ctx.capabilities.includes("org.manage");
  const canInvite = ctx.capabilities.includes("org.members.manage");
  const token = typeof params.invited === "string" ? params.invited : null;
  const ready = projects.length > 0 && members.length > 1;

  return <>
    <AppHeader roleLabel="Organization owner" canCapture={false} />
    <main id="main-content" className="page-shell onboarding-page">
      <section className="reports-intro">
        <div><p className="eyebrow">Workspace setup</p><h1 className="page-title">Make BuildFlow ready for the site</h1>
          <p className="page-lead">Your organization is provisioned. Add a project, bring in one teammate, then import the site structure when you are ready.</p></div>
        {ready ? <Link href="/projects" className="primary-button">Open projects</Link> : null}
      </section>
      {token ? <InviteLinkNotice token={token} /> : null}

      <ol className="onboarding-steps" aria-label="Setup progress">
        <li className="onboarding-step onboarding-step--complete"><span>Done</span><strong>Organization</strong><small>{organization.name}</small></li>
        <li className={`onboarding-step ${projects.length ? "onboarding-step--complete" : ""}`}><span>{projects.length ? "Done" : "Next"}</span><strong>First project</strong><small>{projects[0]?.name ?? "Add the active site"}</small></li>
        <li className={`onboarding-step ${members.length > 1 ? "onboarding-step--complete" : ""}`}><span>{members.length > 1 ? "Done" : "Then"}</span><strong>Teammate</strong><small>{members.length > 1 ? `${members.length} people have access` : "Invite a project teammate"}</small></li>
      </ol>

      {!projects.length && canManage ? <section className="surface-card admin-section" aria-labelledby="onboarding-project">
        <h2 id="onboarding-project">Create the first project</h2>
        <form action={createOnboardingProjectAction} className="admin-form admin-form--three">
          <label>Project name<input name="name" required placeholder="e.g. Sector 62 Tower A" /></label>
          <label>Client<input name="clientName" placeholder="Client or developer" /></label>
          <label>Timezone<select name="timezone" defaultValue="Asia/Kolkata"><option value="Asia/Kolkata">India Standard Time</option></select></label>
          <label>Site address<input name="address" /></label>
          <button className="primary-button" type="submit">Create project</button>
        </form>
      </section> : null}

      {projects.length > 0 && members.length <= 1 && canInvite ? <section className="surface-card admin-section" aria-labelledby="onboarding-invite">
        <h2 id="onboarding-invite">Invite a teammate</h2>
        <p>Start with the person who records or reviews daily site updates.</p>
        <form action={inviteOnboardingMemberAction} className="admin-form">
          <label>Email<input name="email" type="email" required /></label>
          <label>Role<select name="role" defaultValue="site_engineer">{ROLES.filter((role) => role !== "org_owner").map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></label>
          <button className="primary-button" type="submit">Create invitation</button>
        </form>
      </section> : null}

      <section className="surface-card admin-section" aria-labelledby="onboarding-imports">
        <h2 id="onboarding-imports">Prepare site registers</h2>
        <p>Download the samples, replace the example rows, and import them from a project’s Admin page. Keep location parents above their children.</p>
        <div className="onboarding-downloads">
          <a className="secondary-button" href="/api/onboarding/templates/locations">Download locations CSV</a>
          <a className="secondary-button" href="/api/onboarding/templates/activities">Download activities CSV</a>
        </div>
      </section>
    </main>
  </>;
}
