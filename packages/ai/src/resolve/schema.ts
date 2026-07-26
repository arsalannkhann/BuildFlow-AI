import { z } from "zod";

/**
 * Entity-resolution output: the LLM tier of the cascade in `@buildflow/domain/resolve`.
 *
 * The whole safety property of this tier is structural. A model asked "which of this
 * project's records did the engineer mean?" can answer only with an INDEX into a shortlist
 * the server built, or abstain. It has no field in which to write a record name, an id, a
 * quantity or a status, so it physically cannot introduce an entity that does not exist in
 * the project — the classic failure where "sariya" becomes a plausible-sounding steel item
 * nobody ever added to the BOQ (rules.md §11: never invent a record).
 *
 * The tier runs only for phrases the deterministic tiers (exact / alias / fuzzy / semantic)
 * could not settle, so a normal report costs nothing here.
 */
export const ENTITY_RESOLUTION_SCHEMA_VERSION = "entity-resolution.v1" as const;

/** Confidence is coarse on purpose: a five-point scale invites false precision. */
export const resolutionConfidence = z.enum(["high", "medium", "low"]);

export const entityChoiceSchema = z.object({
  /** Index into the question's candidate list, in order. Null means "I cannot tell". */
  choice_index: z.number().int().nonnegative().nullable(),
  confidence: resolutionConfidence,
  /**
   * One short line a reviewer can read before accepting the mapping. Free text, and
   * therefore never used as a value — it is displayed, never stored as a canonical name.
   */
  reason: z.string().trim().max(240).default(""),
});

export const entityResolutionSchema = z.object({
  schema_version: z.literal(ENTITY_RESOLUTION_SCHEMA_VERSION),
  decisions: z.array(entityChoiceSchema.extend({
    /** Index of the question being answered, so a partial or reordered answer stays aligned. */
    question_index: z.number().int().nonnegative(),
  })).max(64),
});

export type EntityChoice = z.infer<typeof entityChoiceSchema>;
export type EntityResolutionResult = z.infer<typeof entityResolutionSchema>;

/**
 * One thing to decide: the words as spoken, what kind of record we are looking for, and the
 * shortlist the server is willing to accept an answer from.
 */
export type ResolutionQuestion = {
  phrase: string;
  kind: string;
  /** Candidate record names, in the order the model will be shown them. */
  candidates: string[];
};

/**
 * Range + confidence gate applied to EVERY provider's output before anything downstream
 * sees it.
 *
 * Two rejections, both of which have to happen server-side because a prompt cannot be
 * relied on to enforce them:
 *   - an index outside the shortlist is a fabricated pointer, so it becomes an abstention
 *     rather than a wrong link;
 *   - `low` confidence is treated as an abstention. A guess that reaches the record with a
 *     quiet "low" attached is worse than an open question on the review screen, because
 *     nobody re-reads a mapping that already looks decided.
 */
export function clampChoice(choice: EntityChoice, candidateCount: number): EntityChoice {
  const index = choice.choice_index;
  if (index === null) return choice;
  if (!Number.isInteger(index) || index < 0 || index >= candidateCount) {
    return { ...choice, choice_index: null, confidence: "low" };
  }
  if (choice.confidence === "low") return { ...choice, choice_index: null };
  return choice;
}

/**
 * Aligns a provider's decision list back onto the questions that were asked.
 * A missing, duplicated or out-of-range `question_index` yields `null` for that question —
 * the phrase stays unresolved and the reviewer is asked, which is the correct default.
 */
export function alignDecisions(
  result: EntityResolutionResult, questions: ResolutionQuestion[],
): (EntityChoice | null)[] {
  const out: (EntityChoice | null)[] = questions.map(() => null);
  for (const decision of result.decisions) {
    const question = questions[decision.question_index];
    if (!question) continue;
    if (out[decision.question_index] !== null) continue; // first answer wins; no silent overwrite
    const { question_index: _index, ...choice } = decision;
    out[decision.question_index] = clampChoice(choice, question.candidates.length);
  }
  return out;
}
