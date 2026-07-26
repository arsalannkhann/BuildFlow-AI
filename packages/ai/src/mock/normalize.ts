import type { TranscriptNormalizationPort, TranscriptResult } from "../ports";
import {
  TRANSCRIPT_NORMALIZED_SCHEMA_VERSION, normalizedTranscriptSchema,
  type NormalizedTranscript,
} from "../normalize/schema";
import { TRANSCRIPT_NORMALIZATION_PROMPT_VERSION } from "../normalize/prompt";
import { detectNormalizationNeed } from "../site/language";

/**
 * Deterministic passthrough normalization for offline dev, tests and CI.
 *
 * It does NOT translate — it echoes the original text behind an explicit marker. The marker
 * matters: a silent passthrough would look like a working Hindi->English rendering in demos
 * and dev, and someone would eventually ship on that belief. It also proves the storage
 * path (original preserved, rendering stored separately) without a network call.
 */
export const MOCK_NORMALIZED_MARKER = "[mock-normalized]";

export class MockTranscriptNormalization implements TranscriptNormalizationPort {
  readonly meta = {
    provider: "mock", model: "mock-normalize-1",
    promptVersion: TRANSCRIPT_NORMALIZATION_PROMPT_VERSION,
  };

  async normalize({ transcript }: { transcript: TranscriptResult }): Promise<NormalizedTranscript | null> {
    const text = transcript.text.trim();
    if (text.length === 0) return null;
    // Same deterministic gate the pipeline uses, so the port is safe to call directly.
    if (!detectNormalizationNeed({ language: transcript.language, text }).needed) return null;
    return normalizedTranscriptSchema.parse({
      schema_version: TRANSCRIPT_NORMALIZED_SCHEMA_VERSION,
      text: `${MOCK_NORMALIZED_MARKER} ${text}`,
      source_language: transcript.language?.trim() || "mixed",
      target_language: "en",
    });
  }
}
