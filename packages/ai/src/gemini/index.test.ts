import { afterEach, describe, expect, test, vi } from "vitest";
import { GeminiEmbeddings, GeminiSummary } from "./index";
import { EMBEDDING_DIMENSIONS } from "../ports";

type Models = ConstructorParameters<typeof GeminiSummary>[0];

afterEach(() => {
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_EMBEDDING_MODEL;
});

describe("Gemini provider", () => {
  test("validates structured summary output", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    const models = {
      generateContent: vi.fn(async () => ({ text: JSON.stringify({ internal: "Internal", clientSafe: "Client" }) })),
    } as unknown as Models;
    const provider = new GeminiSummary(models);

    const result = await provider.summarize({ data: { schema_version: "dpr.v1" } as never });
    expect(result).toEqual({ internal: "Internal", clientSafe: "Client" });
  });

  test("requests and enforces the existing pgvector dimensions", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    const embedContent = vi.fn(async () => ({ embeddings: [{ values: Array(EMBEDDING_DIMENSIONS).fill(0.25) }] }));
    const provider = new GeminiEmbeddings({ embedContent } as unknown as ConstructorParameters<typeof GeminiEmbeddings>[0]);

    const result = await provider.embed({ texts: ["approved report"] });
    expect(result[0]).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(embedContent).toHaveBeenCalledWith(expect.objectContaining({
      model: "gemini-embedding-001",
      config: expect.objectContaining({ outputDimensionality: EMBEDDING_DIMENSIONS }),
    }));
  });
});
