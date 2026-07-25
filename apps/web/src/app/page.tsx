import Link from "next/link";

const WORKFLOW = [
  {
    number: "01",
    title: "Capture what happened",
    body: "Record a voice update and attach the photos or documents already collected on site.",
    tag: "Field evidence",
  },
  {
    number: "02",
    title: "Shape a structured draft",
    body: "BuildFlow organizes work, labour, materials, blockers and next steps without inventing missing facts.",
    tag: "AI-assisted",
  },
  {
    number: "03",
    title: "Review against the source",
    body: "Managers see the draft beside its evidence, resolve gaps and decide what becomes an approved record.",
    tag: "Human control",
  },
  {
    number: "04",
    title: "Put the record to work",
    body: "Approved information feeds reports, project controls, portfolio exceptions and controlled sharing.",
    tag: "One source of truth",
  },
] as const;

const OPERATING_VIEWS = [
  {
    role: "For the site engineer",
    title: "Less form-filling at the end of a hard day.",
    body: "Speak naturally, add evidence and submit a complete update from the field workflow.",
    accent: "field",
    points: ["Voice-first capture", "Photos and documents", "Clear submission status"],
  },
  {
    role: "For the project manager",
    title: "A review queue built around accountability.",
    body: "Compare the draft with source evidence, request changes and issue only what you approve.",
    accent: "review",
    points: ["Evidence beside draft", "Missing-detail warnings", "Controlled approval"],
  },
  {
    role: "For project leadership",
    title: "Exceptions first, with a path back to the record.",
    body: "See which projects need attention and trace every signal to the work behind it.",
    accent: "portfolio",
    points: ["Portfolio exceptions", "Blockers and due work", "Permission-aware answers"],
  },
] as const;

const PLATFORM_AREAS = [
  {
    label: "Daily reporting",
    title: "From field evidence to an issued DPR",
    body: "Voice, photos, structured review, approval history and a professional report stay in one flow.",
    className: "marketing-capability--wide marketing-capability--reports",
  },
  {
    label: "Project controls",
    title: "Plans, blockers, RFIs and revisions",
    body: "Connect daily facts to the records the project team already has to manage.",
    className: "marketing-capability--controls",
  },
  {
    label: "Commercial control",
    title: "Materials, measurement and cost",
    body: "Keep quantities and financial records deterministic, reviewable and linked to evidence.",
    className: "marketing-capability--commercial",
  },
  {
    label: "Portfolio",
    title: "Know where attention is needed",
    body: "Surface missing reports, overdue blockers and operating exceptions before decorative charts.",
    className: "marketing-capability--portfolio",
  },
  {
    label: "Governance",
    title: "Roles, audit trail and controlled sharing",
    body: "Keep organization access scoped and external records intentional, expiring and revocable.",
    className: "marketing-capability--governance",
  },
] as const;

export default function Home() {
  const signupEnabled = process.env.SIGNUPS_ENABLED === "1";
  const primaryHref = signupEnabled ? "/signup" : "/login";
  const primaryLabel = signupEnabled ? "Start a workspace" : "Open workspace";

  return (
    <main id="main-content" className="marketing-page">
      <header className="marketing-header">
        <div className="marketing-header__inner">
          <Link href="/" className="brand-lockup marketing-brand" aria-label="BuildFlow home">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
            <span><strong>BuildFlow</strong><small>Construction operations, clarified</small></span>
          </Link>

          <nav className="marketing-nav" aria-label="Public navigation">
            <a href="#workflow">How it works</a>
            <a href="#teams">Built for teams</a>
            <a href="#platform">Platform</a>
            <a href="#trust">Why BuildFlow</a>
          </nav>

          <div className="marketing-header__actions">
            <Link href="/login" className="marketing-sign-in">Sign in</Link>
            <Link href={primaryHref} className="primary-button">{primaryLabel}</Link>
          </div>

          <details className="marketing-mobile-menu">
            <summary aria-label="Open navigation menu">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span className="sr-only">Menu</span>
            </summary>
            <nav aria-label="Public navigation menu">
              <a href="#workflow">How it works</a>
              <a href="#teams">Built for teams</a>
              <a href="#platform">Platform</a>
              <a href="#trust">Why BuildFlow</a>
              <Link href="/login">Sign in</Link>
              <Link href={primaryHref} className="primary-button">{primaryLabel}</Link>
            </nav>
          </details>
        </div>
      </header>

      <section className="marketing-hero" aria-labelledby="marketing-hero-title">
        <div className="marketing-hero__copy">
          <p className="marketing-eyebrow">
            <span aria-hidden="true" />
            The construction operations workspace
          </p>
          <h1 id="marketing-hero-title">
            Capture the day.
            <span>Trust the record.</span>
          </h1>
          <p className="marketing-hero__lead">
            BuildFlow turns voice notes, site photos and project documents into structured
            records your team can review, approve and act on—without losing the evidence.
          </p>
          <div className="marketing-hero__actions">
            <Link href={primaryHref} className="primary-button marketing-primary-cta">
              {primaryLabel}
              <span aria-hidden="true">↗</span>
            </Link>
            <a href="#workflow" className="marketing-text-link">
              See the field-to-office flow
              <span aria-hidden="true">↓</span>
            </a>
          </div>
          <ul className="marketing-hero__proof" aria-label="BuildFlow operating principles">
            <li><span aria-hidden="true">✓</span> AI drafts</li>
            <li><span aria-hidden="true">✓</span> Your team approves</li>
            <li><span aria-hidden="true">✓</span> Evidence stays linked</li>
          </ul>
        </div>

        <div className="marketing-visual" aria-label="Example BuildFlow workspace showing a site update moving into review">
          <div className="marketing-preview">
            <div className="marketing-preview__topbar">
              <div className="marketing-preview__window" aria-hidden="true"><span /><span /><span /></div>
              <span>Sector 62 · Tower A</span>
              <span className="marketing-preview__live"><i aria-hidden="true" /> Live workspace</span>
            </div>
            <div className="marketing-preview__layout">
              <aside className="marketing-preview__rail" aria-hidden="true">
                <span className="is-active" />
                <span />
                <span />
                <span />
              </aside>
              <div className="marketing-preview__content">
                <div className="marketing-preview__heading">
                  <div>
                    <small>Today · 18 July</small>
                    <strong>Site reporting</strong>
                  </div>
                  <span>Ready to capture</span>
                </div>
                <div className="marketing-preview__metrics">
                  <article><small>Open blockers</small><strong>03</strong><span>Needs attention</span></article>
                  <article><small>Evidence today</small><strong>12</strong><span>Photos + voice</span></article>
                  <article><small>Review queue</small><strong>01</strong><span>Draft DPR</span></article>
                </div>
                <div className="marketing-preview__work">
                  <article className="marketing-capture-card">
                    <div className="marketing-capture-card__header">
                      <span className="marketing-mic" aria-hidden="true"><i /></span>
                      <div><small>Engineer update</small><strong>Capture from the field</strong></div>
                    </div>
                    <div className="marketing-waveform" aria-hidden="true">
                      {[18, 31, 46, 28, 58, 39, 68, 48, 32, 53, 24, 41, 29, 18].map((height, index) => (
                        <span key={`${height}-${index}`} style={{ height }} />
                      ))}
                    </div>
                    <div className="marketing-capture-card__meta">
                      <span><i aria-hidden="true">+</i> 8 photos</span>
                      <span><i aria-hidden="true">✓</i> Saved</span>
                    </div>
                  </article>
                  <article className="marketing-review-card">
                    <div className="marketing-review-card__header">
                      <div><small>Manager review</small><strong>Draft DPR</strong></div>
                      <span>AI draft</span>
                    </div>
                    <ul>
                      <li><span aria-hidden="true">✓</span><div><strong>Work completed</strong><small>Linked to voice + 3 photos</small></div></li>
                      <li><span aria-hidden="true">✓</span><div><strong>Labour on site</strong><small>Source statement attached</small></div></li>
                      <li className="needs-review"><span aria-hidden="true">!</span><div><strong>Material delay</strong><small>Manager detail required</small></div></li>
                    </ul>
                  </article>
                </div>
              </div>
            </div>
          </div>

          <div className="marketing-visual__note">
            <span aria-hidden="true">✓</span>
            <div><small>Approval gate</small><strong>People decide what becomes the record</strong></div>
          </div>
          <div className="marketing-visual__evidence">
            <span aria-hidden="true">08</span>
            <div><small>Evidence items</small><strong>Attached to today&apos;s update</strong></div>
          </div>
        </div>
      </section>

      <section className="marketing-operating-strip" aria-label="BuildFlow product principles">
        <div>
          <p>Built for operational trust</p>
          <ul>
            <li><span>01</span> Natural field capture</li>
            <li><span>02</span> Human-reviewed AI</li>
            <li><span>03</span> Traceable project records</li>
            <li><span>04</span> Role-aware access</li>
          </ul>
        </div>
      </section>

      <section id="teams" className="marketing-section marketing-teams" aria-labelledby="teams-title">
        <div className="marketing-section__intro">
          <p className="marketing-eyebrow"><span aria-hidden="true" /> One workflow, clear responsibilities</p>
          <h2 id="teams-title">Built around the people who move the project.</h2>
          <p>Each view removes noise for the person using it, while preserving one connected operating record underneath.</p>
        </div>
        <div className="marketing-role-grid">
          {OPERATING_VIEWS.map((view, index) => (
            <article className={`marketing-role-card marketing-role-card--${view.accent}`} key={view.role}>
              <div className="marketing-role-card__top">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <small>{view.role}</small>
              </div>
              <h3>{view.title}</h3>
              <p>{view.body}</p>
              <ul>{view.points.map((point) => <li key={point}><span aria-hidden="true">✓</span>{point}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section id="workflow" className="marketing-workflow" aria-labelledby="workflow-title">
        <div className="marketing-workflow__inner">
          <div className="marketing-workflow__heading">
            <p className="marketing-eyebrow marketing-eyebrow--light"><span aria-hidden="true" /> From field input to approved output</p>
            <h2 id="workflow-title">One accountable path from capture to decision.</h2>
            <p>BuildFlow keeps automation in the middle of the workflow—not at the point of accountability.</p>
          </div>
          <ol className="marketing-workflow__steps">
            {WORKFLOW.map((step) => (
              <li key={step.number}>
                <div className="marketing-workflow__number">{step.number}</div>
                <div>
                  <span>{step.tag}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="platform" className="marketing-section marketing-platform" aria-labelledby="platform-title">
        <div className="marketing-section__intro marketing-section__intro--split">
          <div>
            <p className="marketing-eyebrow"><span aria-hidden="true" /> Beyond a reporting tool</p>
            <h2 id="platform-title">One trusted record. The workflows around it.</h2>
          </div>
          <p>Start with the daily site record, then connect controls, commercial work, compliance and portfolio visibility without rebuilding the facts each time.</p>
        </div>
        <div className="marketing-capability-grid">
          {PLATFORM_AREAS.map((area) => (
            <article className={`marketing-capability ${area.className}`} key={area.label}>
              <small>{area.label}</small>
              <h3>{area.title}</h3>
              <p>{area.body}</p>
              {area.label === "Daily reporting" ? (
                <div className="marketing-report-flow" aria-hidden="true">
                  <span>Voice + photos</span><i>→</i><span>Structured draft</span><i>→</i><span>Approved DPR</span>
                </div>
              ) : <span className="marketing-capability__arrow" aria-hidden="true">↗</span>}
            </article>
          ))}
        </div>
      </section>

      <section id="trust" className="marketing-trust" aria-labelledby="trust-title">
        <div className="marketing-trust__visual" aria-label="Example trace from an approved record back to source evidence">
          <div className="marketing-trace-card">
            <div className="marketing-trace-card__header">
              <span aria-hidden="true">✓</span>
              <div><small>Approved record</small><strong>Level 03 slab update</strong></div>
              <time>18 Jul</time>
            </div>
            <div className="marketing-trace-card__line" aria-hidden="true" />
            <div className="marketing-trace-card__sources">
              <article><span aria-hidden="true">◉</span><div><small>Voice evidence</small><strong>Engineer update · 01:42</strong></div></article>
              <article><span aria-hidden="true">▧</span><div><small>Photo evidence</small><strong>3 linked site photos</strong></div></article>
              <article><span aria-hidden="true">↻</span><div><small>Review history</small><strong>1 clarification · approved</strong></div></article>
            </div>
          </div>
        </div>
        <div className="marketing-trust__copy">
          <p className="marketing-eyebrow"><span aria-hidden="true" /> Product trust, by design</p>
          <h2 id="trust-title">AI does the drafting. People stay accountable.</h2>
          <p>Construction records matter beyond the moment they are created. BuildFlow keeps evidence, uncertainty, revisions and approvals visible instead of flattening them into an unexplained answer.</p>
          <ul>
            <li><span aria-hidden="true">01</span><div><strong>Evidence over unsupported prose</strong><p>Material claims remain connected to the inputs behind them.</p></div></li>
            <li><span aria-hidden="true">02</span><div><strong>Review before record</strong><p>Drafts remain distinct until an accountable person approves them.</p></div></li>
            <li><span aria-hidden="true">03</span><div><strong>Access stays scoped</strong><p>Organization and project roles determine which records a person can use.</p></div></li>
          </ul>
        </div>
      </section>

      <section className="marketing-final-cta" aria-labelledby="final-cta-title">
        <div>
          <p className="marketing-eyebrow marketing-eyebrow--light"><span aria-hidden="true" /> Make the next site update the start</p>
          <h2 id="final-cta-title">Give your project team a record they can build on.</h2>
        </div>
        <div>
          <p>Capture naturally on site. Review deliberately in the office. Keep the result useful everywhere else.</p>
          <div>
            <Link href={primaryHref} className="primary-button">{primaryLabel}<span aria-hidden="true">↗</span></Link>
            <Link href="/login" className="marketing-footer-sign-in">Sign in to your workspace</Link>
          </div>
        </div>
      </section>

      <footer className="marketing-footer">
        <div className="marketing-footer__main">
          <Link href="/" className="brand-lockup marketing-brand" aria-label="BuildFlow home">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
            <span><strong>BuildFlow</strong><small>Construction operations, clarified</small></span>
          </Link>
          <p>Field evidence into human-approved construction records.</p>
          <nav aria-label="Footer navigation">
            <a href="#workflow">How it works</a>
            <a href="#teams">Teams</a>
            <a href="#platform">Platform</a>
            <a href="#trust">Why BuildFlow</a>
            <Link href="/login">Sign in</Link>
          </nav>
        </div>
        <div className="marketing-footer__meta">
          <span>BuildFlow AI</span>
          <span>Built for construction teams working from site to office.</span>
        </div>
      </footer>
    </main>
  );
}
