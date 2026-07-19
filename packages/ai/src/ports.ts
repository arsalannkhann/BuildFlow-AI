import type { DprStructuredData } from "@buildflow/domain/dpr/schema";
import type { ChallanExtraction, InvoiceExtraction } from "./documents/schema";

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

// Search embeddings (Phase E3). Deterministic mock keeps dev/tests offline; OpenAI
// text-embedding-3-small behind AI_PROVIDER. Output is validated (finite numbers, fixed
// dimensions) before anything is persisted (rules.md §11).
export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingPort {
  readonly meta: { provider: string; model: string };
  embed(input: { texts: string[] }): Promise<number[][]>;
}

// Grounded question answering (Phase E4 assistant). The model only ever sees permission-
// filtered passages retrieved by the server; its output is zod-validated and its
// citations are re-checked server-side against the caller's scope before rendering.
export type GroundedPassage = {
  /** search_document id — the only currency citations may use. */
  ref: string;
  kind: string;
  title: string;
  snippet: string;
  status: string;
};

export type GroundedAnswer = {
  answer: string;
  citations: string[]; // refs of passages the answer rests on
  insufficient_evidence: boolean;
};

export interface GroundedAnswerPort {
  readonly meta: { provider: string; model: string; promptVersion: string };
  answer(input: { question: string; passages: GroundedPassage[] }): Promise<GroundedAnswer>;
}

// Commercial-document OCR (Phase D). Returns null when the input is unsupported
// (non-image media, unreadable document) — callers mark the receipt/invoice
// "unsupported" and the human enters lines manually. Output is always validated
// against the versioned schema before anything is persisted.
export interface DocumentExtractionPort {
  readonly meta: { provider: string; model: string; promptVersion: string };
  extractChallan(input: { imageBytes: Uint8Array; contentType: string }): Promise<ChallanExtraction | null>;
  extractInvoice(input: { imageBytes: Uint8Array; contentType: string }): Promise<InvoiceExtraction | null>;
}
