import { z } from "zod";
import type { NormalizationReason } from "../site/language";

/**
 * Normalized (English) rendering of a site transcript (T3.3).
 *
 * design.md §19: "Store original transcript and optional normalized/translated text
 * separately. Never replace the original account with a translation." This payload is
 * therefore always ADDITIVE — it lands in `report_revision.transcript_normalized` and the
 * original stays byte-for-byte in `report_revision.transcript`.
 */
export const TRANSCRIPT_NORMALIZED_SCHEMA_VERSION = "transcript-normalized.v1" as const;

export const normalizedTranscriptSchema = z.object({
  schema_version: z.literal(TRANSCRIPT_NORMALIZED_SCHEMA_VERSION),
  /** English rendering of the same account — same facts, same numbers, same negations. */
  text: z.string().trim().min(1),
  /** Language the provider believes it translated FROM (BCP-47 or "mixed"). */
  source_language: z.string().trim().min(1).max(32),
  target_language: z.literal("en"),
});

export type NormalizedTranscript = z.infer<typeof normalizedTranscriptSchema>;

const reason = z.enum(["non_english_language", "devanagari_script", "code_mixed"]);

// Compile-time guarantee that the stored reason stays in step with the detector.
type ReasonsAgree = NormalizationReason extends z.infer<typeof reason> ? true : never;
const _reasonsAgree: ReasonsAgree = true;
void _reasonsAgree;

/**
 * What actually gets persisted: the rendering plus its provenance, so a reader can tell
 * which provider/prompt produced it and a later provider change is auditable (rules.md §11
 * "store prompt, schema, provider, model, and processing versions").
 */
export const normalizedTranscriptRecordSchema = normalizedTranscriptSchema.extend({
  reason,
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt_version: z.string().min(1),
  generated_at: z.string().min(1),
});

export type NormalizedTranscriptRecord = z.infer<typeof normalizedTranscriptRecordSchema>;
