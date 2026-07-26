/**
 * The resolution cascade: free site speech → the project's own controlled vocabulary.
 *
 * This is the layer that makes a DPR operational instead of literary. "chhe mistri the aur
 * sariya khatam ho gaya" has to become `labour: [{trade: mason, count: 6}]` and
 * `materials: [{material: <TMT steel row>, status: shortage}]` before anything downstream —
 * stock ledger, productivity, schedule progress — can be trusted.
 *
 * Techniques are applied cheapest-and-most-auditable first, and each tier reports HOW it
 * decided so the reviewer (and a later auditor) can see it:
 *
 *   1. `exact`    normalized equality with a project record
 *   2. `alias`    seeded or LEARNED dictionary (en / hi / hinglish)
 *   3. `fuzzy`    trigram + token similarity against project records, with an ambiguity guard
 *   4. `semantic` embedding nearest-neighbour (caller supplies; needs pgvector)
 *   5. `llm`      model picks from a SHORT CANDIDATE LIST or abstains — never free-form
 *   6. `unresolved` raw text kept, nothing invented, reviewer decides
 *
 * Tiers 4–5 live in the application layer because they need I/O; this module owns 1–3 and
 * the decision rules, so the deterministic core stays pure and unit-testable.
 */

import { bestMatch, rankCandidates, normalizeText, MATCH_THRESHOLDS, type Candidate, type MatchResult } from "./match";
import {
  formatNumber, foldDigits, numberWordValue, parseNumberToken, parseSpokenQuantity,
  tokenizeWithOffsets, type Token,
} from "./numbers";
import {
  containsAnyTerm, containsTerm, findAllEntries, findEntry, termPattern, type LexiconEntry,
} from "./terms";
import {
  resolveSpokenUnit, resolveUnit, unitDisplay, type CanonicalUnit, type UnitDisplay,
} from "./units";
import { hasNegation, vocabularySeeds, type VocabularyKind } from "./vocabulary";

export type ResolutionMethod = "exact" | "alias" | "fuzzy" | "semantic" | "llm" | "manual" | "unresolved";

export type AliasEntry = {
  kind: string;
  alias: string;
  canonicalValue: string;
  canonicalId?: string | null;
  /** Project-scoped aliases win over organization-scoped ones. */
  projectScoped?: boolean;
};

export type Resolution = {
  rawText: string;
  method: ResolutionMethod;
  /** Canonical English term (e.g. "mason", "tmt steel") when known. */
  canonicalValue: string | null;
  /** Project record id when the canonical term maps to a row. */
  entityId: string | null;
  score: number | null;
  /** Ranked alternatives a reviewer can pick from when we did not decide. */
  candidates: { id: string; name: string; score: number }[];
  /** True when the resolution is safe to apply without confirmation. */
  confident: boolean;
};

const SEEDS = vocabularySeeds();

const unresolved = (rawText: string, candidates: MatchResult[] = []): Resolution => ({
  rawText,
  method: "unresolved",
  canonicalValue: null,
  entityId: null,
  score: null,
  candidates: candidates.map((c) => ({ id: c.candidate.id, name: c.candidate.name, score: c.score })),
  confident: false,
});

/** Looks the phrase up in the alias dictionary; project scope beats org scope. */
export function resolveAlias(
  phrase: string, kind: VocabularyKind | string, learned: AliasEntry[] = [],
): AliasEntry | null {
  const needle = normalizeText(phrase);
  if (!needle) return null;
  const pool = [
    ...learned.filter((entry) => entry.projectScoped),
    ...learned.filter((entry) => !entry.projectScoped),
    ...SEEDS.map((seed) => ({ ...seed, canonicalId: null, projectScoped: false } as AliasEntry)),
  ];
  // Longest alias first so "white cement" wins over "cement" inside the same phrase.
  const sorted = pool
    .filter((entry) => entry.kind === kind)
    .sort((a, b) => normalizeText(b.alias).length - normalizeText(a.alias).length);

  const exact = sorted.find((entry) => normalizeText(entry.alias) === needle);
  if (exact) return exact;
  // Whole-word containment: "6 mistri were working" contains the alias "mistri".
  const padded = ` ${needle} `;
  return sorted.find((entry) => padded.includes(` ${normalizeText(entry.alias)} `)) ?? null;
}

/**
 * Resolves one phrase for one entity kind against the project's records.
 * `records` are the project's own rows; `learned` is the alias dictionary for this scope.
 */
export function resolveTerm(input: {
  phrase: string;
  kind: VocabularyKind | string;
  records?: Candidate[];
  learned?: AliasEntry[];
}): Resolution {
  const { phrase, kind } = input;
  const records = input.records ?? [];
  if (!normalizeText(phrase)) return unresolved(phrase);

  // Tier 1 + 3: match the phrase directly against project records.
  const direct = bestMatch(phrase, records);
  if (direct.match && direct.match.method === "exact") {
    return {
      rawText: phrase, method: "exact", canonicalValue: direct.match.candidate.name,
      entityId: direct.match.candidate.id, score: direct.match.score, candidates: [], confident: true,
    };
  }

  // Tier 2: dictionary. Resolving to a canonical term also gives the fuzzy tier a much
  // better query than the raw phrase ("sariya khatam" → "tmt steel").
  const alias = resolveAlias(phrase, kind, input.learned);
  if (alias) {
    const viaCanonical = bestMatch(alias.canonicalValue, records);
    if (alias.canonicalId) {
      const record = records.find((r) => r.id === alias.canonicalId);
      return {
        rawText: phrase, method: "alias", canonicalValue: alias.canonicalValue,
        entityId: alias.canonicalId, score: 1, candidates: [], confident: true,
      };
      void record;
    }
    if (viaCanonical.match) {
      return {
        rawText: phrase, method: "alias", canonicalValue: alias.canonicalValue,
        entityId: viaCanonical.match.candidate.id, score: viaCanonical.match.score,
        candidates: [], confident: true,
      };
    }
    // Canonical term known, but this project has no matching record. Still useful: the
    // trade/unit is now normalized even though nothing is linked.
    return {
      rawText: phrase, method: "alias", canonicalValue: alias.canonicalValue,
      entityId: null, score: 1,
      candidates: rankCandidates(alias.canonicalValue, records).map((c) => ({
        id: c.candidate.id, name: c.candidate.name, score: c.score,
      })),
      confident: records.length === 0,
    };
  }

  if (direct.match) {
    return {
      rawText: phrase, method: "fuzzy", canonicalValue: direct.match.candidate.name,
      entityId: direct.match.candidate.id, score: direct.match.score, candidates: [], confident: true,
    };
  }

  // Ambiguous or nothing above the floor: hand the shortlist onward (semantic/LLM/reviewer).
  return unresolved(phrase, direct.ambiguous);
}

export type QuantityReading = {
  value: string | null;
  unit: CanonicalUnit | null;
  rawUnit: string | null;
  /** True when a number was found but its unit was not recognised. */
  unitUnknown: boolean;
};

/**
 * Reads a quantity and its unit out of a phrase, normalising both.
 * A number without a unit is reported as such rather than being assigned a default —
 * "18" alone could be sqm or bags, and guessing would corrupt a measured record.
 */
export function readQuantity(phrase: string): QuantityReading {
  const value = parseSpokenQuantity(phrase);
  // Take the token run after the number as the unit candidate, else scan the whole phrase.
  const words = normalizeText(phrase).split(" ");
  let rawUnit: string | null = null;
  for (let i = 0; i < words.length; i += 1) {
    const candidate = [words[i], words[i + 1]].filter(Boolean).join(" ");
    if (resolveSpokenUnit(candidate)) { rawUnit = candidate; break; }
    if (resolveSpokenUnit(words[i])) { rawUnit = words[i]; break; }
  }
  const unit = resolveUnit(rawUnit);
  return { value, unit, rawUnit, unitUnknown: value !== null && unit === null };
}

/** Convenience re-exports so callers import one module. */
export {
  containsAnyTerm, containsTerm, findAllEntries, findEntry, foldDigits, formatNumber,
  hasNegation, MATCH_THRESHOLDS, normalizeText, numberWordValue, parseNumberToken,
  parseSpokenQuantity, rankCandidates, resolveSpokenUnit, resolveUnit, termPattern,
  tokenizeWithOffsets, unitDisplay,
};
export type { Candidate, CanonicalUnit, LexiconEntry, MatchResult, Token, UnitDisplay };
export {
  detectNormalizationNeed, hasDevanagari, hinglishMarkers, HINGLISH_MARKERS,
} from "./language";
export type { NormalizationNeed, NormalizationReason } from "./language";
