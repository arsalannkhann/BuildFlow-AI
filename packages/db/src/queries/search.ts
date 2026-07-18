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
