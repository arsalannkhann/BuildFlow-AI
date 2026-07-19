import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/auth";

export default async function ResetPasswordPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  const error = typeof query.error === "string" ? query.error : null;
  return (
    <main id="main-content" className="login-shell">
      <section className="login-brand-panel">
        <Link href="/" className="brand-lockup brand-lockup--light" aria-label="BuildFlow home">
          <span className="brand-mark brand-mark--light" aria-hidden="true"><span /><span /><span /></span>
          <span><strong>BuildFlow</strong><small>Site reports, simplified</small></span>
        </Link>
        <div>
          <p className="login-kicker">ACCOUNT RECOVERY</p>
          <h1>Choose a new<br />password.</h1>
          <p>This link works once. After the change, every signed-in device is signed out.</p>
        </div>
      </section>
      <section className="login-choice-panel">
        <div className="login-choice-panel__inner">
          <p className="eyebrow">Password reset</p>
          <h2>Set a new password</h2>
          {error ? (
            <p role="alert" className="login-error">
              {error === "weak" ? "Password must be at least 12 characters."
                : error === "mismatch" ? "The two passwords don't match."
                : "This reset link is invalid or has expired. Request a new one."}
            </p>
          ) : null}
          {error === "invalid" ? (
            <p className="login-intro"><Link href="/forgot">Request a new reset link</Link></p>
          ) : (
            <form action={resetPasswordAction} className="login-email-form">
              <input type="hidden" name="token" value={token} />
              <label>
                New password <small>(at least 12 characters)</small>
                <input name="password" type="password" required minLength={12} autoComplete="new-password" />
              </label>
              <label>
                Confirm new password
                <input name="confirm" type="password" required minLength={12} autoComplete="new-password" />
              </label>
              <button className="primary-button" type="submit">Set new password</button>
            </form>
          )}
          <p className="login-intro"><Link href="/login">Back to sign in</Link></p>
        </div>
      </section>
    </main>
  );
}
