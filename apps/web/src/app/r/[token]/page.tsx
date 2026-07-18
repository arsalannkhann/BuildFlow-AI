import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { resolveClientLink } from "@buildflow/db/queries/client-links";
import { audit } from "@buildflow/db/queries/audit";

// Public, token-authenticated client view: only the issued, client-safe content.
// No internal notes, confidence bands, or draft data (design.md §4, PRD §8.5).
export default async function ClientReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await ensureBooted();
  const db = await getDb();
  const resolved = await resolveClientLink(db, token);

  if (!resolved) {
    return (
      <main id="main-content" className="page-shell invite-shell">
        <section className="surface-card admin-section">
          <h1>This report link is not available</h1>
          <p>The link may have expired or been withdrawn. Please contact the project team
            for a current report.</p>
        </section>
      </main>
    );
  }

  await audit(db, {
    organizationId: resolved.link.organizationId,
    userId: `client-link:${resolved.link.id}`, capabilities: [],
  }, { action: "client_link.accessed", subjectRef: resolved.report.id, metadata: { linkId: resolved.link.id } });

  const issuedDate = new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date(`${resolved.report.reportDate}T12:00:00`));

  return (
    <main id="main-content" className="page-shell invite-shell">
      <section className="surface-card admin-section">
        <p className="eyebrow">Daily Progress Report</p>
        <h1>{issuedDate}</h1>
        <p className="admin-empty">
          Document {resolved.issued.documentId} · version {resolved.issued.version}
          {resolved.issued.supersededBy ? " · superseded by a newer version" : ""}
        </p>
        <p>{resolved.revision.summaryClientSafe ?? "See the attached PDF for details."}</p>
        <Link href={`/r/${token}/pdf`} className="primary-button">Download PDF</Link>
      </section>
    </main>
  );
}
