import Link from "next/link";

export function AppHeader({
  roleLabel,
  canCapture = false,
  compact = false,
}: {
  roleLabel: string;
  canCapture?: boolean;
  compact?: boolean;
}) {
  return (
    <header className={`app-header ${compact ? "app-header--compact" : ""}`}>
      <div className="app-header__inner">
        <Link href="/reports" className="brand-lockup" aria-label="BuildFlow reports">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>BuildFlow</strong>
            <small>Site reports, simplified</small>
          </span>
        </Link>

        <div className="app-header__project" aria-label="Current project">
          <span className="project-pulse" aria-hidden="true" />
          <span>
            <small>Active project</small>
            <strong>Sector 62 · Tower A</strong>
          </span>
        </div>

        <nav className="app-header__nav" aria-label="Primary navigation">
          <Link href="/reports">Reports</Link>
          {canCapture && (
            <Link href="/capture" className="header-capture-link" aria-label="Start a new update">
              New update
            </Link>
          )}
          <Link href="/login" className="user-pill" aria-label={`Switch user. Current role: ${roleLabel}`}>
            <span className="user-avatar" aria-hidden="true">
              {roleLabel === "Project Manager" ? "PM" : "SE"}
            </span>
            <span className="user-pill__copy">
              <small>Signed in as</small>
              <strong>{roleLabel}</strong>
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
