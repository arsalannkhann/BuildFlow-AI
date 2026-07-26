/**
 * Deterministic language signals for site transcripts (T3.3).
 *
 * The decision "does this transcript need an English rendering?" must be cheap, offline and
 * repeatable — it gates a paid provider call and it must never flip between runs for the
 * same text. So it is a rule, not a model call.
 *
 * It lives beside the rest of the site vocabulary rather than in the AI layer because the
 * marker list IS site vocabulary: "mistri", "sariya" and "dhalai" appear here and in the
 * alias dictionary, and a word added to one list without the other means a transcript we can
 * resolve but do not recognise as Hinglish.
 *
 * design.md §19: code-mixed content is supported WITHOUT forcing translation. Detecting a
 * need for a normalized rendering never replaces or rewrites the original account.
 */

const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * Romanised Hindi/Urdu function words and site verbs that do not collide with English.
 * Deliberately excludes homographs ("the", "me", "par", "no", "is", "so", "hi") — a false
 * positive here means paying for a translation of plain English, and worse, showing a
 * reviewer a "normalized" panel that adds nothing.
 */
export const HINGLISH_MARKERS: readonly string[] = [
  // negation and existence
  "nahi", "nahin", "nai", "hai", "hain", "tha", "thi", "thay", "hua", "hui", "huye",
  // verbs heard on site
  "aaya", "aayi", "aaye", "aagaya", "gaya", "gayi", "gaye", "kiya", "karna", "karke",
  "karo", "hoga", "hogi", "lagaya", "lagana", "laga", "mila", "milega", "bheja", "bhejo",
  "diya", "dena", "chahiye", "mangwana", "mangaya", "khatam", "chalu", "chal", "raha",
  "rahi", "rahe", "ruka", "ruki", "band", "shuru",
  // time and quantity words
  "aaj", "kal", "parso", "subah", "shaam", "abhi", "baad", "pehle", "thoda", "zyada",
  "jyada", "bahut", "kam", "sab", "sirf", "poora", "puri", "aadha",
  // connectives and postpositions
  "aur", "lekin", "phir", "bhi", "magar", "kyunki", "jaise", "wala", "wali", "walay",
  "mein", "kaam", "ka", "ki", "ke", "se", "ko", "ne", "wo", "yeh", "ye",
  // site nouns that are Hindi even in a mostly-English update
  "mistri", "beldar", "mazdoor", "majdoor", "sariya", "dhalai", "chhat", "chhad", "chinai",
  "khudai", "gitti", "reta", "bajri", "ita", "eent", "pani", "bijli", "malba", "phera",
  "naap", "jhalai", "tarai",
];

const MARKER_SET = new Set(HINGLISH_MARKERS);

/** Word tokens, script-aware: keeps Devanagari together and drops punctuation. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter((token) => token.length > 0);
}

export function hasDevanagari(text: string): boolean {
  return DEVANAGARI.test(text);
}

/** Distinct romanised-Hindi markers present in the text (deterministic, sorted). */
export function hinglishMarkers(text: string): string[] {
  const found = new Set<string>();
  for (const token of tokenize(text)) {
    if (MARKER_SET.has(token)) found.add(token);
  }
  return [...found].sort();
}

export type NormalizationReason = "non_english_language" | "devanagari_script" | "code_mixed";

/** Two independent markers before calling plain English "code-mixed". */
const CODE_MIXED_MARKER_THRESHOLD = 2;

export type NormalizationNeed = {
  needed: boolean;
  reason: NormalizationReason | null;
  markers: string[];
};

/**
 * Decides whether a transcript needs a normalized English rendering stored alongside it.
 *
 * `language` is the transcription provider's detected BCP-47 tag. It is a hint only: a
 * provider frequently labels a Hinglish update "en", so the script and marker checks run
 * regardless of what it claimed.
 */
export function detectNormalizationNeed(input: {
  language?: string | null;
  text: string;
}): NormalizationNeed {
  const markers = hinglishMarkers(input.text);
  if (hasDevanagari(input.text)) return { needed: true, reason: "devanagari_script", markers };
  const language = (input.language ?? "").trim().toLowerCase();
  if (language.length > 0 && !language.startsWith("en")) {
    return { needed: true, reason: "non_english_language", markers };
  }
  if (markers.length >= CODE_MIXED_MARKER_THRESHOLD) {
    return { needed: true, reason: "code_mixed", markers };
  }
  return { needed: false, reason: null, markers };
}
