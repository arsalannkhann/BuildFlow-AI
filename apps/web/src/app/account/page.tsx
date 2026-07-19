import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { AppHeader } from "@/app/components/AppHeader";
import { myPreferenceMatrix } from "@/core/notifications-core";
import { savePreferencesAction } from "@/app/actions/notifications";
import { changePasswordAction } from "@/app/actions/auth";
import { NOTIFY_CHANNELS } from "@buildflow/notify/catalog";

const CHANNEL_LABELS: Record<string, string> = {
  inapp: "In-app", email: "Email", whatsapp: "WhatsApp",
};

export default async function AccountPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const pw = typeof params.pw === "string" ? params.pw : null;
  const db = await getDb();
  const ctx = await currentContext();
  const matrix = await withTenant(db, ctx, (tx) => myPreferenceMatrix(tx, ctx));
  const cells = matrix.flatMap((row) =>
    NOTIFY_CHANNELS.map((channel) => `${row.eventKind}::${channel}`)).join(",");

  return (
    <>
      <AppHeader roleLabel="Member" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Account</p>
        <h1 className="page-title">Notification preferences</h1>

        <section className="surface-card admin-section" aria-labelledby="pref-matrix">
          <h2 id="pref-matrix">Choose how each event reaches you</h2>
          <p className="admin-empty">
            Defaults: in-app for everything; email for review requests, rejections, and
            failures; WhatsApp stays off until you enable it. Messages only ever contain
            record titles and references — never report content.
          </p>
          <form action={savePreferencesAction}>
            <input type="hidden" name="cells" value={cells} />
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  {NOTIFY_CHANNELS.map((c) => <th scope="col" key={c}>{CHANNEL_LABELS[c]}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={row.eventKind}>
                    <td>{row.label}</td>
                    {NOTIFY_CHANNELS.map((channel) => (
                      <td key={channel}>
                        <input
                          type="checkbox"
                          name={`pref:${row.eventKind}::${channel}`}
                          defaultChecked={row.channels[channel]}
                          aria-label={`${row.label} via ${CHANNEL_LABELS[channel]}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="primary-button" type="submit">Save preferences</button>
          </form>
        </section>
        <section className="surface-card admin-section" aria-labelledby="pw-change">
          <h2 id="pw-change">Change password</h2>
          {pw ? (
            <p role={pw === "changed" ? "status" : "alert"}
              className={pw === "changed" ? "login-intro" : "login-error"}>
              {pw === "changed" ? "Password updated. Other signed-in devices were signed out."
                : pw === "wrong" ? "Current password is incorrect."
                : pw === "weak" ? "New password must be at least 12 characters."
                : "The two new passwords don't match."}
            </p>
          ) : null}
          <form action={changePasswordAction} className="admin-form">
            <label>Current password
              <input name="currentPassword" type="password" required autoComplete="current-password" />
            </label>
            <div className="admin-form-row">
              <label>New password
                <input name="newPassword" type="password" required minLength={12} autoComplete="new-password" />
              </label>
              <label>Confirm new password
                <input name="confirm" type="password" required minLength={12} autoComplete="new-password" />
              </label>
            </div>
            <button className="primary-button" type="submit">Change password</button>
          </form>
        </section>
      </main>
    </>
  );
}
