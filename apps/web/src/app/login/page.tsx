import Link from "next/link";
import { loginAction } from "@/app/actions/auth";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const error = typeof params.error === "string" ? params.error : undefined;
  const demoQuickLogin = process.env.DEMO_QUICK_LOGIN === "1" || process.env.NODE_ENV !== "production";
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
          <p className="login-kicker">{demoQuickLogin ? "WORKING PRODUCT DEMO" : "CONSTRUCTION OPERATIONS"}</p>
          <h1>{demoQuickLogin ? <>One project.<br />Two clear workflows.</> : <>Your projects.<br />One trusted record.</>}</h1>
          <p>
            {demoQuickLogin
              ? "Experience BuildFlow as the engineer creating an update or the manager turning that update into an issued report."
              : "Capture field evidence, review project records and act on exceptions from one secure workspace."}
          </p>
        </div>
        {demoQuickLogin ? <div className="login-project-card">
          <span className="project-pulse" aria-hidden="true" />
          <div>
            <small>Demo project</small>
            <strong>Sector 62 · Tower A</strong>
            <p>NCR Developers · Delhi NCR</p>
          </div>
        </div> : null}
      </section>

      <section className="login-choice-panel">
        <div className="login-choice-panel__inner">
          <p className="eyebrow">{demoQuickLogin ? "Choose your view" : "Welcome back"}</p>
          <h2>{demoQuickLogin ? "How are you working today?" : "Sign in to BuildFlow"}</h2>
          <p className="login-intro">
            {demoQuickLogin
              ? "This demo uses three seeded roles. You can switch roles at any time."
              : "Use the account issued by your organization administrator."}
          </p>

          {demoQuickLogin ? <form action={loginAction} className="role-grid">
            <button name="preset" value="engineer" className="role-card">
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
            <button name="preset" value="owner" className="role-card">
              <span className="role-card__icon role-card__icon--manager" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="role-card__copy">
                <strong>Continue as Organization Owner</strong>
                <span>Create projects, invite the team and manage organization settings.</span>
              </span>
              <span className="role-card__arrow" aria-hidden="true">→</span>
            </button>
          </form> : null}

          {error ? (
            <p role="alert" className="login-error">
              {error === "invalid" ? "That email or password did not match. Try again."
                : error === "limited" ? "Too many sign-in attempts. Wait a few minutes, then try again."
                  : "Enter both email and password to sign in."}
            </p>
          ) : null}

          <details className="login-email-details" open={!demoQuickLogin}>
            <summary>{demoQuickLogin ? "Sign in with email instead" : "Email and password"}</summary>
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

          {process.env.SIGNUPS_ENABLED === "1" ? <p className="login-intro">
            Setting up a new company? <Link href="/signup">Create an organization</Link>
          </p> : null}

          {demoQuickLogin ? <p className="login-footnote">
            <span aria-hidden="true">●</span>
            Local demo data only. No real account or customer information.
          </p> : null}
        </div>
      </section>
    </main>
  );
}
