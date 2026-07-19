import { MockTranscription } from "./mock/transcription";
import { MockExtraction } from "./mock/extraction";
import { MockSummary } from "./mock/summary";
import { MockDocumentExtraction } from "./mock/documents";
import { MockEmbeddings } from "./mock/embeddings";
import { MockGroundedAnswer } from "./mock/grounded";
import { openAiRegistry } from "./openai/index";
import type {
  TranscriptionPort, ExtractionPort, SummaryPort, DocumentExtractionPort, EmbeddingPort,
  GroundedAnswerPort,
} from "./ports";

export type AiRegistry = {
  transcription: TranscriptionPort;
  extraction: ExtractionPort;
  summary: SummaryPort;
  documents: DocumentExtractionPort;
  embeddings: EmbeddingPort;
  grounded: GroundedAnswerPort;
};

export function getAiRegistry(): AiRegistry {
  const provider = process.env.AI_PROVIDER ?? "mock";
  if (provider === "openai") return openAiRegistry();
  if (provider === "mock") {
    return {
      transcription: new MockTranscription(), extraction: new MockExtraction(),
      summary: new MockSummary(), documents: new MockDocumentExtraction(),
      embeddings: new MockEmbeddings(), grounded: new MockGroundedAnswer(),
    };
  }
  // A typo must never silently downgrade production to the mock (rules.md §15).
  throw new Error(`Unknown AI_PROVIDER: ${provider} (expected "mock" or "openai")`);
}
