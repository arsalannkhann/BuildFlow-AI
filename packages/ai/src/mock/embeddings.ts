import { createHash } from "node:crypto";
import { EMBEDDING_DIMENSIONS, type EmbeddingPort } from "../ports";

// Deterministic seeded hash vectors: stable across runs and machines, no network, so
// dev and tests exercise the whole store/rank path offline. Not semantically meaningful —
// identical texts match exactly, similar texts do not cluster (PGlite mode is
// lexical-only anyway; see ADR-0002 and the /search degradation note).

const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function deterministicEmbedding(text: string): number[] {
  const digest = createHash("sha256").update(text).digest();
  const rand = mulberry32(digest.readUInt32LE(0));
  const raw = Array.from({ length: EMBEDDING_DIMENSIONS }, () => rand() * 2 - 1);
  const norm = Math.sqrt(raw.reduce((a, v) => a + v * v, 0)) || 1;
  return raw.map((v) => v / norm);
}

export class MockEmbeddings implements EmbeddingPort {
  readonly meta = { provider: "mock", model: "mock-embedding-1" };

  async embed({ texts }: { texts: string[] }): Promise<number[][]> {
    return texts.map(deterministicEmbedding);
  }
}
