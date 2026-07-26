/**
 * Whole-word term lookup over a lexicon.
 *
 * This is the matching half of the dictionary tier, kept apart from the vocabulary itself so
 * that one implementation of "does this clause mention X" serves both the resolution cascade
 * and the extraction layer. Two implementations of it drift: one starts firing "no" inside
 * "north" or "band" inside "abandoned" while the other does not, and the same transcript then
 * produces two different readings depending on which layer read it.
 *
 * Pure, allocation-cached, and script-aware: word boundaries are Unicode letter/number
 * classes, because `\b` treats a Devanagari matra as a boundary and shreds Hindi terms.
 */

/** A canonical label with every spoken form that means it. */
export type LexiconEntry = { canonical: string; terms: readonly string[] };

const escape = (term: string): string => term.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Compiling one regex per term per clause dominated the cost of a full extraction; the
// vocabulary is fixed, so compile each pattern once.
const PATTERNS = new Map<string, RegExp>();

export function termPattern(term: string): RegExp {
  const key = term.toLowerCase();
  let pattern = PATTERNS.get(key);
  if (!pattern) {
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escape(key)}(?![\\p{L}\\p{N}])`, "u");
    PATTERNS.set(key, pattern);
  }
  return pattern;
}

/**
 * Whole-word/phrase containment. Word boundaries matter: "no" must not fire inside
 * "north", and "band" must not fire inside "abandoned".
 */
export function containsTerm(haystackLower: string, term: string): boolean {
  return termPattern(term).test(haystackLower);
}

export function containsAnyTerm(haystackLower: string, terms: readonly string[]): boolean {
  return terms.some((term) => containsTerm(haystackLower, term));
}

// Longest term first so "bar bending machine" beats "bending machine". Sorted once.
const SORTED_TERMS = new WeakMap<readonly LexiconEntry[], readonly (readonly string[])[]>();

function sortedTerms(entries: readonly LexiconEntry[]): readonly (readonly string[])[] {
  let sorted = SORTED_TERMS.get(entries);
  if (!sorted) {
    sorted = entries.map((entry) => [...entry.terms].sort((a, b) => b.length - a.length));
    SORTED_TERMS.set(entries, sorted);
  }
  return sorted;
}

/** First lexicon entry whose term appears in the text, with the matched term. */
export function findEntry(
  haystackLower: string, entries: readonly LexiconEntry[],
): { canonical: string; term: string } | null {
  const terms = sortedTerms(entries);
  for (let index = 0; index < entries.length; index += 1) {
    for (const term of terms[index]) {
      if (containsTerm(haystackLower, term)) return { canonical: entries[index].canonical, term };
    }
  }
  return null;
}

/** Every lexicon entry present in the text, in lexicon order, each with its matched term. */
export function findAllEntries(
  haystackLower: string, entries: readonly LexiconEntry[],
): { canonical: string; term: string }[] {
  const terms = sortedTerms(entries);
  const out: { canonical: string; term: string }[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    for (const term of terms[index]) {
      if (containsTerm(haystackLower, term)) {
        out.push({ canonical: entries[index].canonical, term });
        break;
      }
    }
  }
  return out;
}
