import Link from "next/link";
import { loginAction } from "@/app/actions/auth";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const error = typeof params.error === "string" ? params.error : undefined;
  return (
    <main id="main-content" className="login-shell">
      <section className="login-brand-panel">
        <Link href="/" className="brand-lockup brand-lockup--light" aria-label="BuildFlow home">
          <span className="brand-mark brand-mark--light" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>BuildFlow</strong>
            <small>Site reports, simplified</small>
          </span>
        </Link>
        <div>
          <p className="login-kicker">WORKING PRODUCT DEMO</p>
          <h1>One project.<br />Two clear workflows.</h1>
          <p>
            Experience BuildFlow as the engineer creating an update or the manager
            turning that update into an issued report.
          </p>
        </div>
        <div className="login-project-card">
          <span className="project-pulse" aria-hidden="true" />
          <div>
            <small>Demo project</small>
            <strong>Sector 62 · Tower A</strong>
            <p>NCR Developers · Delhi NCR</p>
          </div>
        </div>
      </section>

      <section className="login-choice-panel">
        <div className="login-choice-panel__inner">
          <p className="eyebrow">Choose your view</p>
          <h2>How are you working today?</h2>
          <p className="login-intro">
            This demo uses two seeded roles. You can switch roles at any time.
          </p>

          <form action={loginAction} className="role-grid">
            <button name="preset" value="engineer" className="role-card">
              <span className="role-card__number">01</span>
              <span className="role-card__icon role-card__icon--field" aria-hidden="true">
                <span />
              </span>
              <span className="role-card__copy">
                <strong>Continue as Site Engineer</strong>
                <span>Record a voice update, add photos and submit today&apos;s progress.</span>
              </span>
              <span className="role-card__arrow" aria-hidden="true">→</span>
            </button>

            <button name="preset" value="manager" className="role-card">
              <span className="role-card__number">02</span>
              <span className="role-card__icon role-card__icon--manager" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="role-card__copy">
                <strong>Continue as Project Manager</strong>
                <span>Review evidence, approve the DPR and issue a finished PDF.</span>
              </span>
              <span className="role-card__arrow" aria-hidden="true">→</span>
            </button>
          </form>

          {error ? (
            <p role="alert" className="login-error">
              {error === "invalid"
                ? "That email or password did not match. Try again."
                : "Enter both email and password to sign in."}
            </p>
          ) : null}

          <details className="login-email-details">
            <summary>Sign in with email instead</summary>
            <form action={loginAction} className="login-email-form">
              <label>
                Email
                <input name="email" type="email" autoComplete="username" required />
              </label>
              <label>
                Password
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              <button type="submit">Sign in</button>
            </form>
          </details>

          <p className="login-footnote">
            <span aria-hidden="true">●</span>
            Local demo data only. No real account or customer information.
          </p>
        </div>
      </section>
    </main>
  );
}
