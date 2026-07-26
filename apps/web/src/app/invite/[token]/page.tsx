import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { findPendingInvitation } from "@buildflow/db/queries/invitations";
import { acceptInviteAction } from "@/app/actions/admin";

const INVITE_ERRORS: Record<string, string> = {
  email_taken: "That email already has a BuildFlow account. Sign in instead, and ask your "
    + "administrator to add you to this project.",
  limited: "Too many attempts. Please wait a few minutes and try again.",
  invalid: "Something was off with the details. Please check and try again.",
};

export default async function InvitePage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  const errorCode = typeof query.error === "string" ? query.error : null;
  const errorMessage = errorCode ? (INVITE_ERRORS[errorCode] ?? INVITE_ERRORS.invalid) : null;
  await ensureBooted();
  const db = await getDb();
  const invitation = token === "invalid" ? null : await findPendingInvitation(db, token);

  if (!invitation) {
    return (
      <main id="main-content" className="page-shell invite-shell">
        <section className="surface-card admin-section">
          <h1>This invitation is not valid</h1>
          <p>The link may have expired, been revoked, or already been used. Ask your
            administrator to send a new invitation.</p>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="page-shell invite-shell">
      <section className="surface-card admin-section">
        <p className="eyebrow">You’re invited</p>
        <h1>Join BuildFlow as {invitation.role.replaceAll("_", " ")}</h1>
        <p>Create your account to start working with your team.</p>
        {errorMessage ? <p role="alert" className="login-error">{errorMessage}</p> : null}
        <form action={acceptInviteAction} className="admin-form">
          <input type="hidden" name="token" value={token} />
          <label>Your name<input name="displayName" required maxLength={120} /></label>
          {invitation.email
            ? <p className="admin-empty">Signing in as <strong>{invitation.email}</strong></p>
            : <label>Email<input name="email" type="email" required /></label>}
          <label>Password (min 8 characters)
            <input name="password" type="password" minLength={8} required autoComplete="new-password" />
          </label>
          <button type="submit" className="primary-button">Create account</button>
        </form>
      </section>
    </main>
  );
}
