import type { DprStructuredData } from "@buildflow/domain/dpr/schema";

export type TranscriptSegment = { text: string; startMs: number; endMs: number };
export type TranscriptResult = { text: string; segments: TranscriptSegment[]; language: string };

export interface TranscriptionPort {
  transcribe(input: { audioBytes: Uint8Array }): Promise<TranscriptResult>;
}
export interface ExtractionPort {
  extract(input: { transcript: TranscriptResult }): Promise<DprStructuredData>;
  readonly meta: { provider: string; model: string; promptVersion: string };
}
export interface SummaryPort {
  summarize(input: { data: DprStructuredData }): Promise<{ internal: string; clientSafe: string }>;
}
