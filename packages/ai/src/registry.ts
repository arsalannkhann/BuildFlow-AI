import { MockTranscription } from "./mock/transcription";
import { MockExtraction } from "./mock/extraction";
import { MockSummary } from "./mock/summary";
import { MockDocumentExtraction } from "./mock/documents";
import { MockEmbeddings } from "./mock/embeddings";
import { MockGroundedAnswer } from "./mock/grounded";
import { MockPhotoTagging } from "./mock/photos";
import { MockTranscriptNormalization } from "./mock/normalize";
import { MockEntityResolution } from "./mock/resolve";
import { openAiRegistry } from "./openai/index";
import { geminiRegistry } from "./gemini/index";
import type {
  TranscriptionPort, ExtractionPort, SummaryPort, DocumentExtractionPort, EmbeddingPort,
  GroundedAnswerPort, PhotoTaggingPort, TranscriptNormalizationPort, EntityResolutionPort,
} from "./ports";

export type AiRegistry = {
  transcription: TranscriptionPort;
  extraction: ExtractionPort;
  summary: SummaryPort;
  documents: DocumentExtractionPort;
  embeddings: EmbeddingPort;
  grounded: GroundedAnswerPort;
  /** Photo -> work-item evidence (T3.1). Required: every provider must answer, even if null. */
  photos: PhotoTaggingPort;
  /** Hindi/Hinglish -> English rendering stored beside the original (T3.3). */
  normalization: TranscriptNormalizationPort;
  /** LLM tier of the resolution cascade: picks from a shortlist or abstains. */
  resolution: EntityResolutionPort;
};

export function getAiRegistry(): AiRegistry {
  const provider = process.env.AI_PROVIDER ?? "mock";
  if (provider === "openai") return openAiRegistry();
  if (provider === "gemini") return geminiRegistry();
  if (provider === "mock") {
    return {
      transcription: new MockTranscription(), extraction: new MockExtraction(),
      summary: new MockSummary(), documents: new MockDocumentExtraction(),
      embeddings: new MockEmbeddings(), grounded: new MockGroundedAnswer(),
      photos: new MockPhotoTagging(), normalization: new MockTranscriptNormalization(),
      resolution: new MockEntityResolution(),
    };
  }
  // A typo must never silently downgrade production to the mock (rules.md §15).
  throw new Error(`Unknown AI_PROVIDER: ${provider} (expected "mock", "openai", or "gemini")`);
}
