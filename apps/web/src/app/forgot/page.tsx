import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/auth";

export default async function ForgotPasswordPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const sent = params.sent === "1";
  return (
    <main id="main-content" className="login-shell">
      <section className="login-brand-panel">
        <Link href="/" className="brand-lockup brand-lockup--light" aria-label="BuildFlow home">
          <span className="brand-mark brand-mark--light" aria-hidden="true"><span /><span /><span /></span>
          <span><strong>BuildFlow</strong><small>Construction operations, clarified</small></span>
        </Link>
        <div>
          <p className="login-kicker">ACCOUNT RECOVERY</p>
          <h1>Locked out?<br />Two minutes.</h1>
          <p>We&apos;ll send a single-use reset link to your account email. Links expire after 30 minutes.</p>
        </div>
      </section>
      <section className="login-choice-panel">
        <div className="login-choice-panel__inner">
          <p className="eyebrow">Password reset</p>
          <h2>Reset your password</h2>
          {sent ? (
            <>
              <p role="status" className="login-intro">
                If an account exists for that email, a reset link is on its way. Check your
                inbox (and spam). The link works once and expires in 30 minutes.
              </p>
              <p className="login-intro">
                No email after a few minutes? Your organization owner can also generate a
                reset link for you from the Organization page.
              </p>
            </>
          ) : (
            <form action={requestPasswordResetAction} className="login-email-form">
              <label>
                Account email
                <input name="email" type="email" required autoComplete="username" />
              </label>
              <button className="primary-button" type="submit">Send reset link</button>
            </form>
          )}
          <p className="login-intro"><Link href="/login">Back to sign in</Link></p>
        </div>
      </section>
    </main>
  );
}
