import { sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type ReportSearchHit = {
  reportId: string;
  projectId: string;
  reportDate: string;
  status: string;
  summary: string | null;
  rank: number;
};

// Approved-record search only: drafts and in-flight reports never appear in results
// (PRD §8.7). Tenant scope is applied in SQL before ranking (rules.md §9).
const SEARCHABLE_STATUSES = ["APPROVED", "ISSUED", "SUPERSEDED"] as const;

export async function searchApprovedReports(
  db: AppDb, ctx: TenantContext, query: string, opts?: { projectId?: string; limit?: number },
): Promise<ReportSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.min(opts?.limit ?? 20, 50);
  const res = await db.execute(sql`
    select dr.id as report_id, dr.project_id, dr.report_date, dr.status,
           rr.summary_internal as summary,
           ts_rank(
             to_tsvector('english',
               coalesce(rr.summary_internal, '') || ' ' || coalesce(rr.transcript->>'text', '')),
             plainto_tsquery('english', ${q})) as rank
    from daily_report dr
    join report_revision rr on rr.id = dr.current_revision_id
      and rr.organization_id = dr.organization_id
    where dr.organization_id = ${ctx.organizationId}
      and dr.status in ('APPROVED', 'ISSUED', 'SUPERSEDED')
      ${opts?.projectId ? sql`and dr.project_id = ${opts.projectId}` : sql``}
      and to_tsvector('english',
            coalesce(rr.summary_internal, '') || ' ' || coalesce(rr.transcript->>'text', ''))
          @@ plainto_tsquery('english', ${q})
    order by rank desc, dr.report_date desc
    limit ${limit}`);
  const rows = (res as unknown as { rows: {
    report_id: string; project_id: string; report_date: string; status: string;
    summary: string | null; rank: number;
  }[] }).rows;
  return rows.map((r) => ({
    reportId: r.report_id, projectId: r.project_id, reportDate: r.report_date,
    status: r.status, summary: r.summary, rank: Number(r.rank),
  }));
}

export { SEARCHABLE_STATUSES };

// --- Phase E3: search_document projection (extends the Phase B FTS above) ---

import { and, eq, inArray } from "drizzle-orm";
import { memberships, searchDocuments, searchEmbeddings } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";

export type SearchDocumentRow = typeof searchDocuments.$inferSelect;
export const SEARCH_KINDS = ["report", "invoice", "receipt", "rfi", "blocker", "mb_entry", "document"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/**
 * Visibility scope for search/assistant: an org-wide membership sees every project,
 * otherwise only the user's project memberships. Applied BEFORE ranking (rules.md §9).
 */
export async function userProjectScope(
  db: AppDb, ctx: TenantContext,
): Promise<{ orgWide: boolean; projectIds: string[] }> {
  const rows = await db.select().from(memberships).where(and(
    eq(memberships.organizationId, ctx.organizationId),
    eq(memberships.userId, ctx.userId),
  ));
  return {
    orgWide: rows.some((m) => m.projectId === null),
    projectIds: [...new Set(rows.map((m) => m.projectId).filter((p): p is string => p !== null))],
  };
}

/** One projection row per (org, kind, refId); re-projection updates in place. */
export async function upsertSearchDocument(db: AppDb, ctx: TenantContext, input: {
  kind: SearchKind; refId: string; projectId: string; title: string; body: string;
  recordStatus: string; recordDate?: string | null;
}): Promise<string> {
  const [row] = await db.insert(searchDocuments).values({
    id: newId(), organizationId: ctx.organizationId, projectId: input.projectId,
    kind: input.kind, refId: input.refId, title: input.title, body: input.body,
    recordStatus: input.recordStatus, recordDate: input.recordDate ?? null,
  }).onConflictDoUpdate({
    target: [searchDocuments.organizationId, searchDocuments.kind, searchDocuments.refId],
    set: {
      projectId: input.projectId, title: input.title, body: input.body,
      recordStatus: input.recordStatus, recordDate: input.recordDate ?? null,
      updatedAt: new Date(),
    },
  }).returning();
  return row.id;
}

export async function upsertSearchEmbedding(db: AppDb, ctx: TenantContext, input: {
  searchDocumentId: string; model: string; embedding: number[];
}): Promise<void> {
  await db.insert(searchEmbeddings).values({
    id: newId(), organizationId: ctx.organizationId,
    searchDocumentId: input.searchDocumentId, model: input.model, embedding: input.embedding,
  }).onConflictDoUpdate({
    target: searchEmbeddings.searchDocumentId,
    set: { model: input.model, embedding: input.embedding, updatedAt: new Date() },
  });
}

export type SearchFilters = {
  kinds?: SearchKind[];
  /** Membership scope — REQUIRED unless orgWide; enforced before ranking. */
  projectIds: string[] | "all";
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export type ProjectedSearchHit = SearchDocumentRow & { rank: number };

/** Lexical ranking over the projection. Tenant + membership filters run BEFORE ts_rank. */
export async function searchProjectedDocuments(
  db: AppDb, ctx: TenantContext, query: string, filters: SearchFilters,
): Promise<ProjectedSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  if (filters.projectIds !== "all" && filters.projectIds.length === 0) return [];
  const limit = Math.min(filters.limit ?? 20, 50);
  const res = await db.execute(sql`
    select sd.*, ts_rank(
             to_tsvector('english', coalesce(sd.title, '') || ' ' || coalesce(sd.body, '')),
             plainto_tsquery('english', ${q})) as rank
    from search_document sd
    where sd.organization_id = ${ctx.organizationId}
      ${filters.projectIds === "all" ? sql`` : sql`and sd.project_id in (${sql.join(filters.projectIds.map((p) => sql`${p}`), sql`, `)})`}
      ${filters.kinds?.length ? sql`and sd.kind in (${sql.join(filters.kinds.map((k) => sql`${k}`), sql`, `)})` : sql``}
      ${filters.dateFrom ? sql`and sd.record_date >= ${filters.dateFrom}` : sql``}
      ${filters.dateTo ? sql`and sd.record_date <= ${filters.dateTo}` : sql``}
      and to_tsvector('english', coalesce(sd.title, '') || ' ' || coalesce(sd.body, ''))
          @@ plainto_tsquery('english', ${q})
    order by rank desc, sd.updated_at desc
    limit ${limit}`);
  const rows = (res as unknown as { rows: Record<string, unknown>[] }).rows;
  return rows.map((r) => ({
    id: String(r.id), organizationId: String(r.organization_id), projectId: String(r.project_id),
    kind: String(r.kind), refId: String(r.ref_id), title: String(r.title), body: String(r.body),
    recordStatus: String(r.record_status),
    recordDate: r.record_date == null ? null : String(r.record_date),
    updatedAt: new Date(String(r.updated_at)), rank: Number(r.rank),
  }));
}

/**
 * Cosine-similarity candidates via pgvector. Callers gate this behind DATABASE_URL:
 * on PGlite, search degrades EXPLICITLY to lexical-only (ADR-0002) and the UI says so.
 * Tenant + membership filters run before the ANN ordering.
 */
export async function semanticSearchCandidates(
  db: AppDb, ctx: TenantContext, embedding: number[], filters: SearchFilters,
): Promise<(SearchDocumentRow & { distance: number })[]> {
  if (filters.projectIds !== "all" && filters.projectIds.length === 0) return [];
  const limit = Math.min(filters.limit ?? 10, 50);
  const literal = JSON.stringify(embedding);
  const res = await db.execute(sql`
    select sd.*, (se.embedding <=> ${literal}::vector) as distance
    from search_embedding se
    join search_document sd on sd.id = se.search_document_id
      and sd.organization_id = se.organization_id
    where se.organization_id = ${ctx.organizationId}
      ${filters.projectIds === "all" ? sql`` : sql`and sd.project_id in (${sql.join(filters.projectIds.map((p) => sql`${p}`), sql`, `)})`}
      ${filters.kinds?.length ? sql`and sd.kind in (${sql.join(filters.kinds.map((k) => sql`${k}`), sql`, `)})` : sql``}
      ${filters.dateFrom ? sql`and sd.record_date >= ${filters.dateFrom}` : sql``}
      ${filters.dateTo ? sql`and sd.record_date <= ${filters.dateTo}` : sql``}
    order by se.embedding <=> ${literal}::vector
    limit ${limit}`);
  const rows = (res as unknown as { rows: Record<string, unknown>[] }).rows;
  return rows.map((r) => ({
    id: String(r.id), organizationId: String(r.organization_id), projectId: String(r.project_id),
    kind: String(r.kind), refId: String(r.ref_id), title: String(r.title), body: String(r.body),
    recordStatus: String(r.record_status),
    recordDate: r.record_date == null ? null : String(r.record_date),
    updatedAt: new Date(String(r.updated_at)), distance: Number(r.distance),
  }));
}

export async function getSearchDocuments(
  db: AppDb, ctx: TenantContext, ids: string[],
): Promise<SearchDocumentRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(searchDocuments).where(and(
    eq(searchDocuments.organizationId, ctx.organizationId),
    inArray(searchDocuments.id, ids),
  ));
}
