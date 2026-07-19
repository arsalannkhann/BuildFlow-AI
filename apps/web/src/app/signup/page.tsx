import Link from "next/link";
import { redirect } from "next/navigation";
import { registerOrganizationAction } from "@/app/actions/auth";

export default async function SignupPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.SIGNUPS_ENABLED !== "1") redirect("/login");
  const params = (await searchParams) ?? {};
  const error = typeof params.error === "string" ? params.error : null;
  return <main id="main-content" className="login-shell">
    <section className="login-brand-panel">
      <Link href="/" className="brand-lockup brand-lockup--light" aria-label="BuildFlow home">
        <span className="brand-mark brand-mark--light" aria-hidden="true"><span /><span /><span /></span>
        <span><strong>BuildFlow</strong><small>Site reports, simplified</small></span>
      </Link>
      <div>
        <p className="login-kicker">NEW WORKSPACE</p>
        <h1>Start with one<br />active project.</h1>
        <p>Create your organization workspace, then add the project and teammate who will use it first.</p>
      </div>
    </section>
    <section className="login-choice-panel">
      <div className="login-choice-panel__inner">
        <p className="eyebrow">Organization setup</p>
        <h2>Create your BuildFlow workspace</h2>
        <p className="login-intro">You will be the organization owner. Use a work email and a password with at least 12 characters.</p>
        {error ? <p role="alert" className="login-error">
          {error === "limited" ? "Too many attempts. Wait before trying again."
            : error === "conflict" ? "That account cannot be registered. Sign in or contact support."
              : "Check the details and try again."}
        </p> : null}
        <form action={registerOrganizationAction} className="login-email-form">
          <label>Organization name<input name="organizationName" required minLength={2} maxLength={120} autoComplete="organization" /></label>
          <label>Your name<input name="ownerName" required minLength={2} maxLength={100} autoComplete="name" /></label>
          <label>Work email<input name="email" type="email" required autoComplete="username" /></label>
          <label>Password<input name="password" type="password" required minLength={12} autoComplete="new-password" /></label>
          <button className="primary-button" type="submit">Create organization</button>
        </form>
        <p className="login-intro">Already have access? <Link href="/login">Sign in</Link></p>
      </div>
    </section>
  </main>;
}
