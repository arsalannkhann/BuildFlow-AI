import { MockTranscription } from "./mock/transcription";
import { MockExtraction } from "./mock/extraction";
import { MockSummary } from "./mock/summary";
import { openAiRegistry } from "./openai/index";
import type { TranscriptionPort, ExtractionPort, SummaryPort } from "./ports";

export type AiRegistry = { transcription: TranscriptionPort; extraction: ExtractionPort; summary: SummaryPort };

export function getAiRegistry(): AiRegistry {
  const provider = process.env.AI_PROVIDER ?? "mock";
  if (provider === "openai") return openAiRegistry();
  return { transcription: new MockTranscription(), extraction: new MockExtraction(), summary: new MockSummary() };
}
