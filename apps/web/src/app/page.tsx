import Link from "next/link";

export default function Home() {
  return (
    <main id="main-content" className="landing-shell">
      <nav className="landing-nav" aria-label="Landing navigation">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>BuildFlow</strong>
            <small>Site reports, simplified</small>
          </span>
        </div>
        <Link href="/login" className="secondary-button">
          Open workspace
        </Link>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="eyebrow">Built for the site, trusted in the office</p>
          <h1>Your site update.<br />A finished DPR.</h1>
          <p>
            Speak for a minute, attach the day&apos;s photos, and BuildFlow prepares a
            structured progress report for your manager to review.
          </p>
          <div className="landing-actions">
            <Link href="/login" className="primary-button">
              Try the working demo
              <span aria-hidden="true">→</span>
            </Link>
            <span className="landing-assurance">
              <span aria-hidden="true">✓</span>
              No setup or external accounts
            </span>
          </div>
        </div>

        <div className="landing-product" aria-label="BuildFlow product preview">
          <div className="landing-product__bar">
            <div>
              <small>SECTOR 62 · TOWER A</small>
              <strong>Today&apos;s site update</strong>
            </div>
            <span>16 JUL</span>
          </div>
          <div className="landing-product__body">
            <div className="mini-status">
              <span />
              No update submitted yet
            </div>
            <div className="demo-record-orb">
              <span className="demo-mic" aria-hidden="true" />
            </div>
            <strong className="demo-record-title">Record today&apos;s update</strong>
            <p>Talk about work completed, labour, materials and blockers.</p>
            <div className="demo-evidence-row">
              <span><b>01</b> Voice note</span>
              <span><b>+</b> Site photos</span>
              <span><b>AI</b> Draft DPR</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-steps" aria-label="How BuildFlow works">
        <article>
          <span>01</span>
          <div>
            <strong>Speak naturally</strong>
            <p>No long forms at the end of a busy site day.</p>
          </div>
        </article>
        <article>
          <span>02</span>
          <div>
            <strong>Add visual evidence</strong>
            <p>Attach the photos already captured on site.</p>
          </div>
        </article>
        <article>
          <span>03</span>
          <div>
            <strong>Review, then issue</strong>
            <p>AI drafts. Your manager remains in control.</p>
          </div>
        </article>
      </section>
    </main>
  );
}
