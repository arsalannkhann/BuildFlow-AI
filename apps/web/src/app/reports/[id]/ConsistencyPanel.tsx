import type { ConsistencyFinding } from "@buildflow/domain/dpr/consistency";

/**
 * The commercial cross-checks a manager would run by eye before certifying a bill, surfaced
 * on the review screen. Every item is a QUESTION for the reviewer, not a verdict — the report
 * is never changed or blocked by these, they only point at where to look (blueprint §8.2, and
 * rules.md §11: a machine flags a record for a human, it does not overrule it).
 *
 * Computed fresh from the current revision on every open, so a correction elsewhere clears the
 * flag without anything to re-run.
 */

const SEVERITY_COPY: Record<ConsistencyFinding["severity"], string> = {
  warning: "Check before approving",
  info: "Worth a look",
};

export function ConsistencyPanel({ findings }: { findings: ConsistencyFinding[] }) {
  if (findings.length === 0) return null;
  const warnings = findings.filter((f) => f.severity === "warning");
  const infos = findings.filter((f) => f.severity === "info");
  const ordered = [...warnings, ...infos];

  return (
    <section className="page-shell surface-card admin-section" aria-labelledby="consistency-heading">
      <h2 id="consistency-heading">Consistency checks</h2>
      <p className="page-lead">
        {warnings.length > 0
          ? `${warnings.length} thing${warnings.length === 1 ? "" : "s"} to confirm before you approve this report. `
          : ""}
        Nothing here changes the report — these only point out where it may contradict itself or
        omit evidence a claim needs.
      </p>
      <ul className="consistency-list">
        {ordered.map((finding) => (
          <li key={finding.code + finding.path} className={`consistency-item consistency-item--${finding.severity}`}>
            <span className="consistency-tag">{SEVERITY_COPY[finding.severity]}</span>
            <div>
              <p className="consistency-message">{finding.message}</p>
              <small>{finding.path}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
