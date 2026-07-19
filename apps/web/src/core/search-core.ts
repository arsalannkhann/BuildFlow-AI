import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import {
  searchProjectedDocuments, semanticSearchCandidates, upsertSearchDocument,
  upsertSearchEmbedding, userProjectScope, SEARCH_KINDS,
  type ProjectedSearchHit, type SearchFilters, type SearchKind,
} from "@buildflow/db/queries/search";
import { getReport, listReports } from "@buildflow/db/queries/reports";
import { latestRevision } from "@buildflow/db/queries/revisions";
import { getInvoice, listInvoiceLines, listInvoices } from "@buildflow/db/queries/invoices";
import { getReceipt, listReceiptLines, listReceipts } from "@buildflow/db/queries/materials";
import { getMbEntry, listMbEntries } from "@buildflow/db/queries/mb";
import {
  getBlocker, getDocument, getRfi, listBlockers, listDocumentRevisions, listDocuments,
  listRfis,
} from "@buildflow/db/queries/controls";
import { listProjects } from "@buildflow/db/queries/projects";
import { EMBEDDING_DIMENSIONS } from "@buildflow/ai/ports";
import { getAiRegistry } from "@buildflow/ai/registry";
import { audit } from "@buildflow/db/queries/audit";

// Approved-family statuses get the green badge; anything else renders as a working/draft
// record — the UI must never blur that line (rules.md §11: separate facts from drafts).
const APPROVED_STATUSES = new Set([
  "APPROVED", "ISSUED", "SUPERSEDED", "approved", "posted", "certified", "exported",
]);
export const isApprovedStatus = (status: string): boolean => APPROVED_STATUSES.has(status);

const semanticAvailable = () => Boolean(process.env.DATABASE_URL);

// --- projection writers (called from 1-2 line hooks in the owning cores) ---

async function project(db: AppDb, ctx: TenantContext, input: {
  kind: SearchKind; refId: string; projectId: string; title: string; body: string;
  recordStatus: string; recordDate?: string | null;
}): Promise<void> {
  const docId = await upsertSearchDocument(db, ctx, input);
  try {
    const embeddings = getAiRegistry().embeddings;
    const [vector] = await embeddings.embed({ texts: [`${input.title}\n${input.body}`.slice(0, 8000)] });
    // Validate provider output before persistence (rules.md §11).
    if (vector?.length === EMBEDDING_DIMENSIONS && vector.every(Number.isFinite)) {
      await upsertSearchEmbedding(db, ctx, {
        searchDocumentId: docId, model: embeddings.meta.model, embedding: vector,
      });
    }
  } catch {
    // Embeddings are an enhancement: a provider outage must never block an approval or
    // posting. Lexical search still covers the record; backfill can add the vector later.
  }
}

export async function projectReportDocument(db: AppDb, ctx: TenantContext, reportId: string): Promise<void> {
  const report = await getReport(db, ctx, reportId);
  const rev = await latestRevision(db, ctx, reportId);
  const transcriptText = (rev?.transcript as { text?: string } | null)?.text ?? "";
  await project(db, ctx, {
    kind: "report", refId: report.id, projectId: report.projectId,
    title: `DPR ${report.reportDate}`,
    body: [rev?.summaryInternal ?? "", transcriptText].filter(Boolean).join("\n"),
    recordStatus: report.status, recordDate: report.reportDate,
  });
}

export async function projectInvoiceDocument(db: AppDb, ctx: TenantContext, invoiceId: string): Promise<void> {
  const invoice = await getInvoice(db, ctx, invoiceId);
  if (!invoice) return;
  const lines = await listInvoiceLines(db, ctx, invoiceId);
  await project(db, ctx, {
    kind: "invoice", refId: invoice.id, projectId: invoice.projectId,
    title: `Invoice ${invoice.invoiceNumber ?? "(no number)"}`,
    body: lines.map((l) => l.description).join("\n"),
    recordStatus: invoice.status, recordDate: invoice.invoiceDate ?? null,
  });
}

export async function projectReceiptDocument(db: AppDb, ctx: TenantContext, receiptId: string): Promise<void> {
  const receipt = await getReceipt(db, ctx, receiptId);
  if (!receipt) return;
  const lines = await listReceiptLines(db, ctx, receiptId);
  await project(db, ctx, {
    kind: "receipt", refId: receipt.id, projectId: receipt.projectId,
    title: `Challan ${receipt.challanNumber ?? "(no number)"} ${receipt.receiptDate}`,
    body: lines.map((l) => l.descriptionRaw).join("\n"),
    recordStatus: receipt.status, recordDate: receipt.receiptDate,
  });
}

export async function projectMbDocument(db: AppDb, ctx: TenantContext, entryId: string): Promise<void> {
  const entry = await getMbEntry(db, ctx, entryId);
  if (!entry) return;
  await project(db, ctx, {
    kind: "mb_entry", refId: entry.id, projectId: entry.projectId,
    title: `MB entry #${entry.mbNumber}`,
    body: entry.description,
    recordStatus: entry.status, recordDate: entry.measurementDate,
  });
}

export async function projectBlockerDocument(db: AppDb, ctx: TenantContext, blockerId: string): Promise<void> {
  const blocker = await getBlocker(db, ctx, blockerId);
  if (!blocker) return;
  await project(db, ctx, {
    kind: "blocker", refId: blocker.id, projectId: blocker.projectId,
    title: `Blocker: ${blocker.title}`,
    body: [blocker.description ?? "", blocker.resolutionNote ?? ""].filter(Boolean).join("\n"),
    recordStatus: blocker.status, recordDate: blocker.dueDate ?? null,
  });
}

export async function projectRfiDocument(db: AppDb, ctx: TenantContext, rfiId: string): Promise<void> {
  const rfi = await getRfi(db, ctx, rfiId);
  if (!rfi) return;
  await project(db, ctx, {
    kind: "rfi", refId: rfi.id, projectId: rfi.projectId,
    title: `RFI #${rfi.number}: ${rfi.subject}`,
    body: rfi.question,
    recordStatus: rfi.status, recordDate: rfi.dueDate ?? null,
  });
}

export async function projectDrawingDocument(db: AppDb, ctx: TenantContext, documentId: string): Promise<void> {
  const doc = await getDocument(db, ctx, documentId);
  if (!doc) return;
  const revisions = await listDocumentRevisions(db, ctx, documentId);
  await project(db, ctx, {
    kind: "document", refId: doc.id, projectId: doc.projectId,
    title: `${doc.title}${doc.docNumber ? ` (${doc.docNumber})` : ""}`,
    body: revisions.map((r) => `Rev ${r.revisionLabel}: ${r.notes ?? ""}`).join("\n"),
    recordStatus: doc.currentRevisionId ? "issued" : "registered",
    recordDate: null,
  });
}

// --- search (tenant + membership filter BEFORE ranking) ---

export type SearchResult = {
  hits: (ProjectedSearchHit & { approved: boolean; href: string; semantic?: boolean })[];
  /** False on PGlite: the UI shows "semantic ranking requires PostgreSQL". */
  semanticRankingActive: boolean;
};

export function searchHitHref(hit: { kind: string; refId: string; projectId: string }): string {
  switch (hit.kind) {
    case "report": return `/reports/${hit.refId}`;
    case "invoice": return `/projects/${hit.projectId}/budget/invoices/${hit.refId}`;
    case "receipt": return `/projects/${hit.projectId}/materials/receipts/${hit.refId}`;
    case "rfi": return `/projects/${hit.projectId}/rfis/${hit.refId}`;
    case "blocker": return `/projects/${hit.projectId}/blockers`;
    case "mb_entry": return `/projects/${hit.projectId}/mb/${hit.refId}`;
    case "document": return `/projects/${hit.projectId}/documents/${hit.refId}`;
    default: return `/projects/${hit.projectId}`;
  }
}

export async function runSearch(db: AppDb, ctx: TenantContext, input: {
  query: string; kind?: SearchKind | null; projectId?: string | null;
  dateFrom?: string | null; dateTo?: string | null;
}): Promise<SearchResult> {
  assertCan(ctx, "project.read");
  const scope = await userProjectScope(db, ctx);
  let projectIds: string[] | "all" = scope.orgWide ? "all" : scope.projectIds;
  if (input.projectId) {
    // Intersect the requested project with the membership scope — never widen it.
    projectIds = scope.orgWide || scope.projectIds.includes(input.projectId)
      ? [input.projectId] : [];
  }
  const filters: SearchFilters = {
    projectIds,
    kinds: input.kind ? [input.kind] : undefined,
    dateFrom: input.dateFrom ?? undefined,
    dateTo: input.dateTo ?? undefined,
    limit: 30,
  };

  const lexical = await searchProjectedDocuments(db, ctx, input.query, filters);
  const hits: SearchResult["hits"] = lexical.map((h) => ({
    ...h, approved: isApprovedStatus(h.recordStatus), href: searchHitHref(h),
  }));

  if (semanticAvailable() && input.query.trim()) {
    try {
      const embeddings = getAiRegistry().embeddings;
      const [vector] = await embeddings.embed({ texts: [input.query.trim()] });
      const candidates = await semanticSearchCandidates(db, ctx, vector, { ...filters, limit: 10 });
      for (const c of candidates) {
        if (hits.some((h) => h.id === c.id)) continue;
        hits.push({
          ...c, rank: 0, approved: isApprovedStatus(c.recordStatus),
          href: searchHitHref(c), semantic: true,
        });
      }
      return { hits, semanticRankingActive: true };
    } catch {
      return { hits, semanticRankingActive: false };
    }
  }
  return { hits, semanticRankingActive: false };
}

// --- backfill (rebuildable projection, not a source of truth) ---

/** Rebuilds the whole projection from source tables. org.manage only. */
export async function backfillSearchProjection(db: AppDb, ctx: TenantContext): Promise<number> {
  assertCan(ctx, "org.manage");
  let count = 0;
  const reports = await listReports(db, ctx);
  for (const r of reports) {
    if (!["APPROVED", "ISSUED", "SUPERSEDED"].includes(r.status)) continue;
    await projectReportDocument(db, ctx, r.id);
    count += 1;
  }
  for (const p of await listProjects(db, ctx)) {
    for (const inv of await listInvoices(db, ctx, p.id)) {
      if (inv.status !== "approved") continue;
      await projectInvoiceDocument(db, ctx, inv.id); count += 1;
    }
    for (const rec of await listReceipts(db, ctx, p.id, { status: "posted" })) {
      await projectReceiptDocument(db, ctx, rec.id); count += 1;
    }
    for (const mb of await listMbEntries(db, ctx, p.id, { status: "certified" })) {
      await projectMbDocument(db, ctx, mb.id); count += 1;
    }
    for (const b of await listBlockers(db, ctx, p.id)) {
      await projectBlockerDocument(db, ctx, b.id); count += 1;
    }
    for (const rfi of await listRfis(db, ctx, p.id)) {
      await projectRfiDocument(db, ctx, rfi.id); count += 1;
    }
    for (const doc of await listDocuments(db, ctx, p.id)) {
      await projectDrawingDocument(db, ctx, doc.id); count += 1;
    }
  }
  await audit(db, ctx, { action: "search.projection_backfilled", subjectRef: ctx.organizationId, metadata: { count } });
  return count;
}

export { SEARCH_KINDS };
export type { SearchKind };
