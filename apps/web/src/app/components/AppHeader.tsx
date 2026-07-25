import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { withTenant } from "@buildflow/db/tenant";
import { memberships } from "@buildflow/db/schema";
import { getAuth } from "@buildflow/auth/dev";
import { resolveTenantContext } from "@buildflow/auth/context";
import { getProject } from "@buildflow/db/queries/projects";
import { unreadNotificationCount } from "@buildflow/db/queries/notifications";
import { ROLES, type Role, type TenantContext } from "@buildflow/domain/tenancy";
import { SESSION_COOKIE } from "@/app/session";

const ROLE_LABELS: Record<Role, string> = {
  org_owner: "Organization Owner",
  project_admin: "Project Admin",
  project_manager: "Project Manager",
  site_engineer: "Site Engineer",
  quantity_surveyor: "Quantity Surveyor",
  procurement_manager: "Procurement Manager",
  accountant: "Accountant",
  client_viewer: "Client Viewer",
  auditor: "Auditor",
};

type HeaderSession = {
  ctx: TenantContext;
  roleLabel: string;
  projectName: string | null;
  unread: number;
  showPortfolio: boolean;
};

// Derives everything the header shows from the session itself, so every page renders the
// same truthful identity/project/nav state. Never redirects and never throws — a header
// must not break a page render (public pages simply get the signed-out variant).
async function headerSession(): Promise<HeaderSession | null> {
  try {
    await ensureBooted();
    const { cookies } = await import("next/headers");
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const db = await getDb();
    const sessionUser = await getAuth().verifySession(db, token);
    if (!sessionUser) return null;
    const ctx = await resolveTenantContext(db, sessionUser.userId);

    const [unread, myMemberships] = await withTenant(db, ctx, (tx) => Promise.all([
      unreadNotificationCount(tx, ctx),
      tx.select().from(memberships).where(eq(memberships.userId, ctx.userId)),
    ]));
    const activeMembership =
      myMemberships.find((m) => m.projectId && m.projectId === ctx.projectId) ??
      myMemberships.find((m) => m.projectId === null) ??
      myMemberships[0];
    const role = activeMembership?.role;
    const roleLabel = role && (ROLES as readonly string[]).includes(role)
      ? ROLE_LABELS[role as Role]
      : "Signed in";

    let projectName: string | null = null;
    const activeProjectId = ctx.projectId;
    if (activeProjectId) {
      projectName = (await withTenant(db, ctx, (tx) => getProject(tx, ctx, activeProjectId))
        .catch(() => null))?.name ?? null;
    }

    const projectIds = new Set(myMemberships.map((m) => m.projectId).filter(Boolean));
    const showPortfolio = ctx.capabilities.includes("org.audit.read")
      || myMemberships.some((m) => m.projectId === null)
      || projectIds.size > 1;

    return { ctx, roleLabel, projectName, unread, showPortfolio };
  } catch {
    return null;
  }
}

function navLinks(session: HeaderSession | null) {
  const links: { href: string; label: string }[] = [
    { href: "/reports", label: "Reports" },
    { href: "/projects", label: "Projects" },
    { href: "/search", label: "Search" },
    { href: "/assistant", label: "Assistant" },
    { href: "/organization", label: "Organization" },
  ];
  if (session?.showPortfolio) links.push({ href: "/portfolio", label: "Portfolio" });
  links.push({ href: "/account", label: "Account" });
  return links;
}

export async function AppHeader({
  roleLabel: legacyRoleLabel,
  canCapture = false,
  compact = false,
  projectName,
}: {
  /** @deprecated The header derives the role from the session; this is a fallback only. */
  roleLabel?: string;
  canCapture?: boolean;
  compact?: boolean;
  /** Project being viewed. Overrides the session default so the header never claims a
   *  different project than the page (project pages pass their own). */
  projectName?: string;
}) {
  const session = await headerSession();
  const roleLabel = session?.roleLabel ?? legacyRoleLabel ?? "Signed in";
  const showCapture = session ? session.ctx.capabilities.includes("report.create") : canCapture;
  const links = navLinks(session);
  const bell = session ? (
    <Link href="/notifications" className="header-bell" aria-label={
      session.unread > 0 ? `Notifications: ${session.unread} unread` : "Notifications"
    }>
      <span aria-hidden="true">🔔</span>
      {session.unread > 0 ? (
        <span className="header-bell__count">{session.unread > 99 ? "99+" : session.unread}</span>
      ) : null}
    </Link>
  ) : null;

  return (
    <header className={`app-header ${compact ? "app-header--compact" : ""}`}>
      <div className="app-header__inner">
        <Link href="/reports" className="brand-lockup" aria-label="BuildFlow reports">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>BuildFlow</strong>
            <small>Construction operations, clarified</small>
          </span>
        </Link>

        {projectName ?? session?.projectName ? (
          <div className="app-header__project" aria-label="Current project">
            <span className="project-pulse" aria-hidden="true" />
            <span>
              <small>Active project</small>
              <strong>{projectName ?? session?.projectName}</strong>
            </span>
          </div>
        ) : null}

        <nav className="app-header__nav" aria-label="Primary navigation">
          {links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
          {bell}
          {showCapture && (
            <Link href="/capture" className="header-capture-link" aria-label="Start a new update">
              New update
            </Link>
          )}
          <Link href="/login" className="user-pill" aria-label={`Switch user. Current role: ${roleLabel}`}>
            <span className="user-avatar" aria-hidden="true">
              {roleLabel.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </span>
            <span className="user-pill__copy">
              <small>Signed in as</small>
              <strong>{roleLabel}</strong>
            </span>
          </Link>
        </nav>

        {/* Small screens: the full nav collapses into an accessible disclosure menu. */}
        <details className="app-header__mobile">
          <summary aria-label="Open menu">
            <span aria-hidden="true">☰</span>
            <span className="app-header__mobile-label">Menu</span>
          </summary>
          <nav aria-label="Primary navigation (menu)">
            {showCapture && (
              <Link href="/capture" className="header-capture-link">New update</Link>
            )}
            {links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
            <Link href="/notifications">
              Notifications{session && session.unread > 0 ? ` (${session.unread})` : ""}
            </Link>
            <Link href="/login">Switch user · {roleLabel}</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
