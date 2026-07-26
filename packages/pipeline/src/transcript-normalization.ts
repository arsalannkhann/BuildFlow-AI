import { and, eq } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { reportRevisions } from "@buildflow/db/schema";
import type { TenantContext } from "@buildflow/domain/tenancy";
import type { AiRegistry } from "@buildflow/ai/registry";
import type { TranscriptResult } from "@buildflow/ai/ports";
import {
  TRANSCRIPT_NORMALIZED_SCHEMA_VERSION, normalizedTranscriptRecordSchema,
  type NormalizedTranscriptRecord,
} from "@buildflow/ai/normalize/schema";
import { detectNormalizationNeed } from "@buildflow/ai/site/language";

/**
 * Normalized transcript production and storage (T3.3).
 *
 * design.md §19: the original account is never replaced. This module only ever writes
 * `report_revision.transcript_normalized`; `transcript` is not in any update it issues, so
 * the engineer's own words cannot be overwritten by a translation even by accident.
 *
 * DEVIATION (noted deliberately): the write uses drizzle directly instead of a
 * `packages/db/src/queries/revisions.ts` helper, because `addRevision` does not accept a
 * normalized transcript and `packages/db` is outside this change's file boundary. If that
 * boundary lifts, move this UPDATE into `addRevision` as one more optional column.
 */

/** Produces the rendering, or null when the transcript needs none. */
export async function buildNormalizedTranscript(input: {
  ai: AiRegistry;
  transcript: TranscriptResult;
}): Promise<NormalizedTranscriptRecord | null> {
  const { ai, transcript } = input;
  const text = transcript.text?.trim() ?? "";
  if (text.length === 0) return null;

  const need = detectNormalizationNeed({ language: transcript.language, text });
  if (!need.needed || need.reason === null) return null;

  const normalized = await ai.normalization.normalize({ transcript });
  if (!normalized) return null;

  return normalizedTranscriptRecordSchema.parse({
    ...normalized,
    schema_version: TRANSCRIPT_NORMALIZED_SCHEMA_VERSION,
    reason: need.reason,
    provider: ai.normalization.meta.provider,
    model: ai.normalization.meta.model,
    prompt_version: ai.normalization.meta.promptVersion,
    generated_at: new Date().toISOString(),
  });
}

/** Stores the rendering ALONGSIDE the original. Never touches `transcript`. */
export async function storeNormalizedTranscript(
  db: AppDb,
  ctx: TenantContext,
  revisionId: string,
  record: NormalizedTranscriptRecord,
): Promise<void> {
  await db.update(reportRevisions)
    .set({ transcriptNormalized: record })
    .where(and(
      eq(reportRevisions.id, revisionId),
      eq(reportRevisions.organizationId, ctx.organizationId),
    ));
}
