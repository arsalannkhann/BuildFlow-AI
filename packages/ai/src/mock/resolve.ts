import type { EntityResolutionPort } from "../ports";
import {
  ENTITY_RESOLUTION_SCHEMA_VERSION, alignDecisions, entityResolutionSchema,
  type EntityChoice, type ResolutionQuestion,
} from "../resolve/schema";
import { ENTITY_RESOLUTION_PROMPT_VERSION } from "../resolve/prompt";

/**
 * Deterministic stand-in for the LLM tier.
 *
 * It decides by literal token overlap between the spoken phrase and each candidate name, and
 * abstains on a tie. That is deliberately weaker than a real model — the mock must never make
 * the offline suite look like the cascade understands language it actually cannot, because
 * every eval number would then be measuring this file instead of the provider (see
 * `packages/ai/evals/README.md`).
 *
 * What it does prove, offline and on every machine: the plumbing, the alignment of answers
 * to questions, and every server-side gate that turns a bad answer into an abstention.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "and", "at", "on", "in", "to", "work", "works",
  "ka", "ki", "ke", "mein", "par", "se", "hai", "tha", "the_",
]);

const tokenize = (text: string): string[] =>
  text.normalize("NFC").toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));

function decide(question: ResolutionQuestion): EntityChoice {
  const phrase = new Set(tokenize(question.phrase));
  if (phrase.size === 0) return { choice_index: null, confidence: "low", reason: "nothing to match" };

  const scored = question.candidates.map((candidate, index) => {
    const overlap = tokenize(candidate).filter((token) => phrase.has(token)).length;
    return { index, overlap };
  }).sort((a, b) => b.overlap - a.overlap);

  const best = scored[0];
  if (!best || best.overlap === 0) {
    return { choice_index: null, confidence: "low", reason: "no shared words with any candidate" };
  }
  // A tie is an abstention, not a coin flip: two candidates sharing the same words with the
  // phrase is precisely the case a human has to settle.
  if (scored[1] && scored[1].overlap === best.overlap) {
    return { choice_index: null, confidence: "low", reason: "two candidates match equally well" };
  }
  return {
    choice_index: best.index,
    confidence: best.overlap > 1 ? "high" : "medium",
    reason: `${best.overlap} shared word(s) with the candidate name`,
  };
}

export class MockEntityResolution implements EntityResolutionPort {
  readonly meta = {
    provider: "mock", model: "mock-resolve-1", promptVersion: ENTITY_RESOLUTION_PROMPT_VERSION,
  };

  async choose({ questions }: {
    transcript: string; questions: ResolutionQuestion[];
  }): Promise<(EntityChoice | null)[]> {
    // Round-tripped through the real schema and the real alignment/clamp path so the mock
    // cannot accept a shape a provider would be rejected for.
    const result = entityResolutionSchema.parse({
      schema_version: ENTITY_RESOLUTION_SCHEMA_VERSION,
      decisions: questions.map((question, index) => ({ question_index: index, ...decide(question) })),
    });
    return alignDecisions(result, questions);
  }
}
