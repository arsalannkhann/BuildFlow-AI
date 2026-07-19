import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { AppHeader } from "@/app/components/AppHeader";
import { myNotifications, notificationHref } from "@/core/notifications-core";
import {
  markAllNotificationsReadAction, markNotificationReadAction,
} from "@/app/actions/notifications";
import type { NotificationDeliveryRow } from "@buildflow/db/queries/notifications";

// Delivery status copy per docs/PHASE-E-DESIGN.md: honest, operational, no lock-screen
// style content anywhere (the row itself only ever holds titles + record refs).
function deliveryLabel(d: NotificationDeliveryRow): string {
  if (d.status === "sent") return `sent via ${d.channel}`;
  if (d.status === "queued") return `${d.channel} queued`;
  if (d.status === "failed") return `${d.channel} failed — will retry`;
  return `${d.channel} could not be delivered`;
}

export default async function NotificationsPage() {
  const db = await getDb();
  const ctx = await currentContext();
  const rows = await myNotifications(db, ctx, { limit: 100 });
  const unread = rows.filter((r) => !r.readAt);

  return (
    <>
      <AppHeader roleLabel="Member" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Notifications</p>
        <h1 className="page-title">Your notifications</h1>

        <section className="surface-card admin-section" aria-labelledby="notif-list">
          <h2 id="notif-list">{unread.length > 0 ? `${unread.length} unread` : "All caught up"}</h2>
          {unread.length > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button className="secondary-button" type="submit">Mark all read</button>
            </form>
          ) : null}
          {rows.length === 0 ? (
            <p className="admin-empty">
              Nothing yet. You will see review requests, blockers, shortages, and delivery
              statuses here. Channel preferences live on your <Link href="/account">account page</Link>.
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">What</th>
                  <th scope="col">Delivery</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr key={n.id} style={n.readAt ? undefined : { fontWeight: 600 }}>
                    <td>{n.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td>
                      <Link href={notificationHref(n)}>{n.title}</Link>
                      {n.body ? <div style={{ fontWeight: 400, fontSize: "0.85em" }}>{n.body}</div> : null}
                    </td>
                    <td>
                      {n.deliveries.length === 0
                        ? "in-app"
                        : ["in-app", ...n.deliveries.map(deliveryLabel)].join(" · ")}
                    </td>
                    <td>
                      {n.readAt ? "read" : (
                        <form action={markNotificationReadAction}>
                          <input type="hidden" name="notificationId" value={n.id} />
                          <button className="secondary-button" type="submit">Mark read</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
