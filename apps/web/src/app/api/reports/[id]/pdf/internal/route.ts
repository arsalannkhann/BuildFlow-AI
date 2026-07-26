import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getReport } from "@buildflow/db/queries/reports";
import { latestIssued } from "@buildflow/db/queries/issued";
import { getStorage } from "@buildflow/storage/factory";
import { renderDprPdf } from "@buildflow/pdf/render";
import { buildDprPdfInput } from "@/app/actions/review-core";

/**
 * The internal copy of an approved DPR: same approved revision as the issued client
 * document, plus the internal summary, every item's confidence band and the verified
 * transcript quotes behind it.
 *
 * Rendered on demand and never stored: the issued client PDF is the project's record
 * (rules.md §13), and a second stored artifact for the same revision would compete with
 * it. Gated on `report.review` — the audience is the project team, not the client — and
 * the query stays org-scoped through withTenant() exactly like the issued-PDF route.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const ctx = await currentContext();
  if (!ctx.capabilities.includes("report.review")) {
    return new Response("Forbidden", { status: 403 });
  }

  const prepared = await withTenant(db, ctx, async (tx) => {
    const report = await getReport(tx, ctx, id).catch(() => null);
    if (!report) return null;
    // Only an approved record has a document. A draft under review has no internal copy;
    // the review screen is where a draft is read.
    if (!["APPROVED", "ISSUED", "SUPERSEDED"].includes(report.status)) return "not-approved" as const;
    const issued = await latestIssued(tx, ctx, id);
    return buildDprPdfInput(tx, getStorage(), ctx, id, {
      variant: "internal",
      // A stable identifier for this copy: the issued document id once one exists, so the
      // internal copy and the client document are traceable to each other.
      documentId: issued?.documentId ?? `INTERNAL-${id}`,
      version: issued?.version ?? 1,
      dprNumber: report.dprNumber,
      approvedAt: issued ? issued.issuedAt.toISOString().slice(0, 16).replace("T", " ") : null,
    });
  });

  if (prepared === null) return new Response("Not found", { status: 404 });
  if (prepared === "not-approved") {
    return new Response("An internal copy is available once the report is approved", { status: 409 });
  }

  const pdf = await renderDprPdf(prepared);
  const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="DPR-${prepared.documentId}-INTERNAL.pdf"`,
      // Never cached by a shared cache: this copy is not for client distribution.
      "Cache-Control": "private, no-store",
    },
  });
}
