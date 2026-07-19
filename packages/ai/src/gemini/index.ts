import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { dprSchema, type DprStructuredData } from "@buildflow/domain/dpr/schema";
import type { AiRegistry } from "../registry";
import {
  EMBEDDING_DIMENSIONS,
  type DocumentExtractionPort,
  type EmbeddingPort,
  type ExtractionPort,
  type GroundedAnswer,
  type GroundedAnswerPort,
  type GroundedPassage,
  type SummaryPort,
  type TranscriptResult,
  type TranscriptionPort,
} from "../ports";
import { challanSchema, invoiceExtractionSchema, type ChallanExtraction, type InvoiceExtraction } from "../documents/schema";
import { groundedAnswerSchema } from "../grounded/schema";
import { GROUNDED_ANSWER_PROMPT_VERSION, GROUNDED_ANSWER_SYSTEM_PROMPT } from "../grounded/prompt";
import {
  CHALLAN_SYSTEM_PROMPT,
  DPR_EXTRACTION_SYSTEM_PROMPT,
  GEMINI_DOCUMENT_PROMPT_VERSION,
  GEMINI_DPR_PROMPT_VERSION,
  INVOICE_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  TRANSCRIPTION_SYSTEM_PROMPT,
} from "./prompts";

type GeminiModels = Pick<GoogleGenAI["models"], "generateContent" | "embedContent">;
type GenerateRequest = Parameters<GeminiModels["generateContent"]>[0];

const SUPPORTED_IMAGE = /^image\/(jpeg|png|webp|gif)$/;

const transcriptSchema = z.object({
  text: z.string(),
  language: z.string(),
  segments: z.array(z.object({
    text: z.string(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })),
});

const summarySchema = z.object({ internal: z.string(), clientSafe: z.string() });

function configuration() {
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required when AI_PROVIDER=gemini");
  return {
    project,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    reasoningModel: process.env.GEMINI_REASONING_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
  };
}

function createModels(): GeminiModels {
  const config = configuration();
  return new GoogleGenAI({ vertexai: true, project: config.project, location: config.location }).models;
}

async function generateJson(
  models: GeminiModels,
  model: string,
  systemInstruction: string,
  contents: GenerateRequest["contents"],
): Promise<unknown> {
  const response = await models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      temperature: 0,
      responseMimeType: "application/json",
      abortSignal: AbortSignal.timeout(120_000),
    },
  });
  if (!response.text) throw new Error("Gemini response contained no text");
  try {
    return JSON.parse(response.text) as unknown;
  } catch {
    throw new Error("Gemini response was not valid JSON");
  }
}

export class GeminiTranscription implements TranscriptionPort {
  constructor(private readonly models: GeminiModels = createModels()) {}

  async transcribe({ audioBytes }: { audioBytes: Uint8Array }): Promise<TranscriptResult> {
    const { model } = configuration();
    const raw = await generateJson(this.models, model, TRANSCRIPTION_SYSTEM_PROMPT, [{
      role: "user",
      parts: [
        { text: "Transcribe this field recording and return JSON only." },
        { inlineData: { data: Buffer.from(audioBytes).toString("base64"), mimeType: "audio/webm" } },
      ],
    }]);
    const transcript = transcriptSchema.parse(raw);
    for (const segment of transcript.segments) {
      if (segment.endMs < segment.startMs) throw new Error("Gemini transcript segment has an invalid time range");
    }
    return transcript;
  }
}

export class GeminiExtraction implements ExtractionPort {
  readonly meta;

  constructor(private readonly models: GeminiModels = createModels()) {
    this.meta = { provider: "gemini", model: configuration().model, promptVersion: GEMINI_DPR_PROMPT_VERSION };
  }

  async extract({ transcript }: { transcript: TranscriptResult }): Promise<DprStructuredData> {
    const raw = await generateJson(
      this.models,
      this.meta.model,
      DPR_EXTRACTION_SYSTEM_PROMPT,
      JSON.stringify({ schema_version: "dpr.v1", transcript }),
    );
    return dprSchema.parse(raw);
  }
}

export class GeminiSummary implements SummaryPort {
  constructor(private readonly models: GeminiModels = createModels()) {}

  async summarize({ data }: { data: DprStructuredData }) {
    const raw = await generateJson(this.models, configuration().model, SUMMARY_SYSTEM_PROMPT, JSON.stringify(data));
    return summarySchema.parse(raw);
  }
}

export class GeminiEmbeddings implements EmbeddingPort {
  readonly meta;

  constructor(private readonly models: GeminiModels = createModels()) {
    this.meta = { provider: "gemini", model: configuration().embeddingModel };
  }

  async embed({ texts }: { texts: string[] }): Promise<number[][]> {
    const vectors: number[][] = [];
    // gemini-embedding-001 accepts one input per request. Preserve ordering explicitly.
    for (const text of texts) {
      const response = await this.models.embedContent({
        model: this.meta.model,
        contents: text,
        config: {
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: EMBEDDING_DIMENSIONS,
          autoTruncate: false,
          abortSignal: AbortSignal.timeout(60_000),
        },
      });
      const vector = response.embeddings?.[0]?.values;
      if (!vector || vector.length !== EMBEDDING_DIMENSIONS || vector.some((value) => !Number.isFinite(value))) {
        throw new Error("Gemini embedding response failed validation");
      }
      vectors.push(vector);
    }
    return vectors;
  }
}

export class GeminiGroundedAnswer implements GroundedAnswerPort {
  readonly meta;

  constructor(private readonly models: GeminiModels = createModels()) {
    this.meta = {
      provider: "gemini",
      model: configuration().reasoningModel,
      promptVersion: GROUNDED_ANSWER_PROMPT_VERSION,
    };
  }

  async answer({ question, passages }: { question: string; passages: GroundedPassage[] }): Promise<GroundedAnswer> {
    const raw = await generateJson(
      this.models,
      this.meta.model,
      GROUNDED_ANSWER_SYSTEM_PROMPT,
      JSON.stringify({ question, passages }),
    );
    return groundedAnswerSchema.parse(raw);
  }
}

export class GeminiDocumentExtraction implements DocumentExtractionPort {
  readonly meta;

  constructor(private readonly models: GeminiModels = createModels()) {
    this.meta = { provider: "gemini", model: configuration().model, promptVersion: GEMINI_DOCUMENT_PROMPT_VERSION };
  }

  private async extractDocument(
    systemInstruction: string,
    imageBytes: Uint8Array,
    contentType: string,
  ): Promise<unknown> {
    return generateJson(this.models, this.meta.model, systemInstruction, [{
      role: "user",
      parts: [
        { text: "Extract this document and return JSON only." },
        { inlineData: { data: Buffer.from(imageBytes).toString("base64"), mimeType: contentType } },
      ],
    }]);
  }

  async extractChallan({ imageBytes, contentType }: {
    imageBytes: Uint8Array; contentType: string;
  }): Promise<ChallanExtraction | null> {
    if (!SUPPORTED_IMAGE.test(contentType)) return null;
    return challanSchema.parse(await this.extractDocument(CHALLAN_SYSTEM_PROMPT, imageBytes, contentType));
  }

  async extractInvoice({ imageBytes, contentType }: {
    imageBytes: Uint8Array; contentType: string;
  }): Promise<InvoiceExtraction | null> {
    if (!SUPPORTED_IMAGE.test(contentType)) return null;
    return invoiceExtractionSchema.parse(await this.extractDocument(INVOICE_SYSTEM_PROMPT, imageBytes, contentType));
  }
}

export function geminiRegistry(): AiRegistry {
  const models = createModels();
  return {
    transcription: new GeminiTranscription(models),
    extraction: new GeminiExtraction(models),
    summary: new GeminiSummary(models),
    documents: new GeminiDocumentExtraction(models),
    embeddings: new GeminiEmbeddings(models),
    grounded: new GeminiGroundedAnswer(models),
  };
}
