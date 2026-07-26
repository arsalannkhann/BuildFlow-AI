import { NextResponse } from "next/server";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { getReport } from "@buildflow/db/queries/reports";
import { latestRevision } from "@buildflow/db/queries/revisions";
import type { DprStructuredData } from "@buildflow/domain/dpr/schema";
import { assertCan } from "@buildflow/domain/tenancy";
import { getAiRegistry } from "@buildflow/ai/registry";
import { currentContext } from "@/app/session";
import {
  listResolutions, loadProjectVocabulary, recordResolutions, refineResolutions,
  resolveReportEntities,
} from "@/core/resolution-core";

/** GET: the recorded resolution trail for a report. */
export async function GET(
  _req: Request, { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const db = await getDb();
  const ctx = await currentContext();
  const rows = await withTenant(db, ctx, (tx) => listResolutions(tx, ctx, id));
  return NextResponse.json({ resolutions: rows });
}

/**
 * POST: (re)compute resolutions for the report's current revision, deterministic tiers first
 * and then the semantic + LLM tiers.
 *
 * This is the "I just added the missing location, try again" path — it exists so a reviewer
 * never has to re-record a site update to fix a mapping. Gated on `report.review` because it
 * spends provider calls; recomputing appends a fresh trail rather than editing history, and
 * never modifies the report's claims.
 */
export async function POST(
  _req: Request, { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const report = await withTenant(db, base, (tx) => getReport(tx, base, id));
  const ctx = { ...base, projectId: report.projectId };
  const revision = await withTenant(db, ctx, (tx) => latestRevision(tx, ctx, id));
  if (!revision) return NextResponse.json({ resolutions: [], reason: "no revision" });

  assertCan(ctx, "report.review");

  const vocabulary = await withTenant(db, ctx, (tx) => loadProjectVocabulary(tx, ctx, report.projectId));
  const deterministic = resolveReportEntities(revision.structuredData as DprStructuredData, vocabulary);
  const { findings, stats } = await refineResolutions({
    ai: getAiRegistry(),
    transcript: (revision.transcript as { text?: string } | null)?.text ?? "",
    findings: deterministic,
    vocab: vocabulary,
  });
  await withTenant(db, ctx, (tx) => recordResolutions(tx, ctx, {
    reportId: id, projectId: report.projectId, revisionId: revision.id, findings,
  }));

  return NextResponse.json({
    resolved: findings.filter((f) => f.resolution.confident).length,
    needsReview: findings.filter((f) => !f.resolution.confident).length,
    tiers: stats,
    findings: findings.map((f) => ({
      fieldPath: f.fieldPath, entityKind: f.entityKind, method: f.resolution.method,
      canonicalValue: f.resolution.canonicalValue, entityId: f.resolution.entityId,
      rawText: f.resolution.rawText, candidates: f.resolution.candidates,
      quantity: f.quantity, negated: f.negated,
    })),
  });
}
