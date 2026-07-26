/**
 * Number + unit READING for extraction: which number in a clause belongs to which unit, and
 * which number belongs to which trade.
 *
 * WHY THIS ADAPTER EXISTS: the number words, the Devanagari digit fold, the offset-preserving
 * tokenizer and the decimal formatting are all layer-0 primitives and now live in
 * `@buildflow/domain/resolve/numbers`, so "chaar", "4" and "४" read as the same value in every
 * layer. What stays here is the extraction-specific pairing: a number that has no unit must
 * NEVER be handed back as a measured quantity — that is how "2.5" silently becomes "2.5 cum" —
 * so `FoundQuantity` reports a null unit and the caller decides.
 */

import {
  formatNumber, parseNumberToken, tokenizeWithOffsets,
} from "@buildflow/domain/resolve/numbers";
import { normalizeSpokenUnit, type CanonicalUnit } from "./units";

export {
  foldDigits, formatNumber, parseNumberToken, tokenizeWithOffsets,
} from "@buildflow/domain/resolve/numbers";
export type { Token } from "@buildflow/domain/resolve/numbers";

export type FoundQuantity = {
  /** Decimal string, exactly as the schema expects. */
  value: string;
  /** Canonical unit, or null when the speaker gave a bare number. */
  unit: CanonicalUnit | null;
  /** Unit words as actually spoken ("cubic meters"), for provenance. */
  spokenUnit: string | null;
  /** Character offset of the number in the source text. */
  index: number;
};

const UNIT_FILLER = new Set(["of", "ka", "ki", "ke"]);
const MAX_UNIT_TOKENS = 3;

/**
 * Every number in the text, each with the unit that follows it when one is recognisable.
 * Callers that need a measurement filter on `unit !== null`.
 */
export function findQuantities(text: string): FoundQuantity[] {
  const tokens = tokenizeWithOffsets(text);
  const found: FoundQuantity[] = [];
  tokens.forEach((token, position) => {
    const value = parseNumberToken(token.text);
    if (value === null) return;
    let unit: CanonicalUnit | null = null;
    let spokenUnit: string | null = null;
    const words: string[] = [];
    for (let ahead = position + 1; ahead < tokens.length && words.length < MAX_UNIT_TOKENS; ahead += 1) {
      const next = tokens[ahead].text.toLowerCase();
      if (UNIT_FILLER.has(next) && words.length === 0) continue; // "50 of bag"
      if (parseNumberToken(next) !== null) break;               // next number starts a new pair
      words.push(next);
      const candidate = normalizeSpokenUnit(words.join(" "));
      if (candidate) { unit = candidate; spokenUnit = words.join(" "); }
    }
    found.push({ value: formatNumber(value), unit, spokenUnit, index: token.start });
  });
  return found;
}

/**
 * Count that belongs to a term ("six masons", "mistri 4"). Looks back two tokens first —
 * that is the natural order in both English and Hindi — then one token forward.
 */
export function findCountForTerm(text: string, term: string): number | null {
  const tokens = tokenizeWithOffsets(text);
  const termTokens = term.toLowerCase().split(/\s+/);
  for (let position = 0; position < tokens.length; position += 1) {
    const window = tokens.slice(position, position + termTokens.length)
      .map((token) => token.text.toLowerCase());
    if (window.join(" ") !== termTokens.join(" ")) continue;
    for (let back = 1; back <= 2; back += 1) {
      const candidate = tokens[position - back];
      if (!candidate) break;
      const value = parseNumberToken(candidate.text);
      if (value !== null) return value;
    }
    const after = tokens[position + termTokens.length];
    const forward = after ? parseNumberToken(after.text) : null;
    if (forward !== null) return forward;
  }
  return null;
}
