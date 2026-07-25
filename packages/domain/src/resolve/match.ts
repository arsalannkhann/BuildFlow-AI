/**
 * Deterministic string matching used to map a spoken phrase onto a project's own records
 * (locations, activities, materials, contractors, equipment).
 *
 * Deliberately dependency-free and pure: the same phrase and candidate set always produce
 * the same score, so a resolution can be re-derived and defended months later. Scores are
 * bounded 0..1 and combine three cheap signals that fail in different ways:
 *   - token containment (handles "column C4" vs "C4 column casting")
 *   - Dice coefficient over character trigrams (handles typos and transliteration drift)
 *   - token Jaccard (handles reordering and extra words)
 */

export type Candidate = { id: string; name: string; extra?: string | null };

export type MatchResult = {
  candidate: Candidate;
  score: number;
  method: "exact" | "fuzzy";
};

const STOPWORDS = new Set([
  "the", "a", "an", "of", "on", "in", "at", "for", "and", "to", "work", "works",
  "ka", "ki", "ke", "me", "mein", "par", "se", "aur",
]);

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFC")
    // keep letters (any script) and digits; everything else becomes a separator
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokens(value: string): string[] {
  return normalizeText(value).split(" ").filter((t) => t && !STOPWORDS.has(t));
}

function trigrams(value: string): Set<string> {
  const padded = `  ${normalizeText(value).replace(/\s+/g, " ")}  `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) grams.add(padded.slice(i, i + 3));
  return grams;
}

function diceCoefficient(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const left = new Set(a);
  const right = new Set(b);
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/**
 * How strongly `phrase` refers to `candidateName`. Containment of every candidate token in
 * the phrase scores highest, because site speech adds words around the reference
 * ("finished the C4 column casting today") rather than restating the record's name.
 */
export function similarity(phrase: string, candidateName: string): number {
  const phraseNorm = normalizeText(phrase);
  const nameNorm = normalizeText(candidateName);
  if (!phraseNorm || !nameNorm) return 0;
  if (phraseNorm === nameNorm) return 1;

  const phraseTokens = tokens(phrase);
  const nameTokens = tokens(candidateName);
  if (nameTokens.length === 0 || phraseTokens.length === 0) return 0;

  const phraseSet = new Set(phraseTokens);
  const containedAll = nameTokens.every((t) => phraseSet.has(t));
  const containsSubstring = phraseNorm.includes(nameNorm) || nameNorm.includes(phraseNorm);

  const dice = diceCoefficient(phraseNorm, nameNorm);
  const jac = jaccard(phraseTokens, nameTokens);

  if (containedAll || containsSubstring) {
    // A full reference is present; keep a little headroom below an exact match so that a
    // literal equality always outranks a containment.
    return Math.min(0.99, 0.9 + 0.09 * Math.max(dice, jac));
  }
  return Math.max(dice, jac) * 0.9;
}

/** Confidence thresholds shared by every resolution surface. */
export const MATCH_THRESHOLDS = {
  /** At or above this the mapping may be applied as `Supported`. */
  confident: 0.82,
  /** At or above this it is offered to the reviewer as a suggestion (`Check`). */
  suggest: 0.55,
} as const;

/** Ranks candidates best-first, dropping anything below the suggestion floor. */
export function rankCandidates(phrase: string, candidates: Candidate[], limit = 5): MatchResult[] {
  return candidates
    .map((candidate) => {
      const score = Math.max(
        similarity(phrase, candidate.name),
        candidate.extra ? similarity(phrase, candidate.extra) * 0.95 : 0,
      );
      const method: MatchResult["method"] =
        normalizeText(phrase) === normalizeText(candidate.name) ? "exact" : "fuzzy";
      return { candidate, score, method };
    })
    .filter((result) => result.score >= MATCH_THRESHOLDS.suggest)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Picks a single match only when it is both confident AND clearly ahead of the runner-up.
 * Two near-equal candidates are an ambiguity a human must settle, not a coin flip.
 */
export function bestMatch(phrase: string, candidates: Candidate[]): {
  match: MatchResult | null; ambiguous: MatchResult[];
} {
  const ranked = rankCandidates(phrase, candidates);
  if (ranked.length === 0) return { match: null, ambiguous: [] };
  const [top, second] = ranked;
  const decisive = !second || top.score - second.score >= 0.08;
  if (top.score >= MATCH_THRESHOLDS.confident && decisive) return { match: top, ambiguous: [] };
  return { match: null, ambiguous: ranked };
}
