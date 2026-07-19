import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { memberships } from "@buildflow/db/schema";
import { getAuth } from "@buildflow/auth/dev";
import { resolveTenantContext } from "@buildflow/auth/context";
import { unreadNotificationCount } from "@buildflow/db/queries/notifications";
import { SESSION_COOKIE } from "@/app/session";

/**
 * Async header extras: notification bell with unread count, plus a Portfolio link for
 * people who oversee more than one project (org.audit.read, an org-wide membership, or
 * memberships on 2+ projects). Renders nothing when signed out — never redirects, so
 * AppHeader stays usable on public pages.
 */
export async function HeaderStatus() {
  try {
    await ensureBooted();
    const { cookies } = await import("next/headers");
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const db = await getDb();
    const sessionUser = await getAuth().verifySession(db, token);
    if (!sessionUser) return null;
    const ctx = await resolveTenantContext(db, sessionUser.userId);

    const [unread, myMemberships] = await Promise.all([
      unreadNotificationCount(db, ctx),
      db.select().from(memberships).where(eq(memberships.userId, ctx.userId)),
    ]);
    const projectIds = new Set(myMemberships.map((m) => m.projectId).filter(Boolean));
    const showPortfolio = ctx.capabilities.includes("org.audit.read")
      || myMemberships.some((m) => m.projectId === null)
      || projectIds.size > 1;

    return (
      <>
        {showPortfolio ? <Link href="/portfolio">Portfolio</Link> : null}
        <Link href="/account">Account</Link>
        <Link href="/notifications" className="header-bell" aria-label={
          unread > 0 ? `Notifications: ${unread} unread` : "Notifications"
        }>
          <span aria-hidden="true">🔔</span>
          {unread > 0 ? <span className="header-bell__count">{unread > 99 ? "99+" : unread}</span> : null}
        </Link>
      </>
    );
  } catch {
    return null; // header extras must never break a page render
  }
}
