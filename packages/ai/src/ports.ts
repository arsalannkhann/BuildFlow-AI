import type { DprStructuredData } from "@buildflow/domain/dpr/schema";
import type { ChallanExtraction, InvoiceExtraction } from "./documents/schema";
import type { PhotoTag } from "./photos/schema";
import type { NormalizedTranscript } from "./normalize/schema";
import type { EntityChoice, ResolutionQuestion } from "./resolve/schema";

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

// Photo tagging (T3.1). Turns an uploaded site photo into a caption, tags, and — at most —
// a pointer to one of the work items the ENGINEER already reported, so `attachment_id`
// citations carry real evidence. Returns null for a mime type an image model cannot read,
// exactly like DocumentExtractionPort, so the "no photo evidence" path stays honest.
//
// Boundary: a photo is evidence for an existing claim. Nothing this port returns may change
// a quantity, a progress figure, a status, or add a work item (rules.md §11: never claim a
// visual progress percentage as fact).
export interface PhotoTaggingPort {
  readonly meta: { provider: string; model: string; promptVersion: string };
  tagPhoto(input: {
    imageBytes: Uint8Array;
    contentType: string;
    /** Candidate work items, in report order. A match may ONLY be an index into this list. */
    workItemDescriptions: string[];
  }): Promise<PhotoTag | null>;
}

// Transcript normalization (T3.3). Produces an English rendering of a Hindi/Hinglish update
// that is stored ALONGSIDE the original — never over it (design.md §19). Returns null when
// the transcript needs no rendering (already English) or when there is nothing to render.
export interface TranscriptNormalizationPort {
  readonly meta: { provider: string; model: string; promptVersion: string };
  normalize(input: { transcript: TranscriptResult }): Promise<NormalizedTranscript | null>;
}

// Entity resolution, LLM tier. The last step of the cascade in `@buildflow/domain/resolve`,
// reached only for phrases the deterministic tiers could not settle.
//
// Boundary: the model chooses an INDEX from a shortlist the server built, or abstains. It
// cannot name a record, so it cannot introduce one that does not exist in the project. The
// returned array is aligned to `questions` — `null` at a position means "still unresolved",
// which routes the phrase to the reviewer instead of the record.
export interface EntityResolutionPort {
  readonly meta: { provider: string; model: string; promptVersion: string };
  choose(input: {
    /** Surrounding words, for disambiguation only. Never a source of new facts. */
    transcript: string;
    questions: ResolutionQuestion[];
  }): Promise<(EntityChoice | null)[]>;
}
