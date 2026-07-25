/**
 * Spoken-quantity parsing for Indian site speech.
 *
 * Site engineers rarely say "2.5". They say "dhai", "do point paanch", "साढ़े दो",
 * "two and a half", or "sava do". A transcript that reaches extraction with these intact
 * either produces a null quantity (information lost) or tempts the model into guessing a
 * number — which is the failure mode rules.md §11 forbids. Parsing them deterministically
 * keeps the number auditable: given the same words we always produce the same value, and
 * when we cannot parse we return null rather than inventing.
 *
 * Everything here is pure and returns decimal STRINGS (rules.md §7: never binary floats
 * for measured quantities).
 */

const UNITS: Record<string, number> = {
  // English
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Hinglish / transliterated Hindi (common spelling variants included deliberately)
  shunya: 0, ek: 1, do: 2, teen: 3, tin: 3, char: 4, char_: 4, chaar: 4, panch: 5,
  paanch: 5, pach: 5, chhe: 6, che: 6, chha: 6, chhah: 6, chey: 6, saat: 7, sat: 7,
  aath: 8, ath: 8, nau: 9, no: 9, das: 10, dus: 10, gyarah: 11, gyara: 11, barah: 12,
  bara: 12, terah: 13, tera: 13, chaudah: 14, chauda: 14, pandrah: 15, pandra: 15,
  solah: 16, sola: 16, satrah: 17, satra: 17, atharah: 18, athara: 18, unnis: 19,
  bees: 20, bis: 20, ikkis: 21, bais: 22, tais: 23, chaubis: 24, pachchis: 25,
  tees: 30, tis: 30, chalis: 40, chalees: 40, pachas: 50, pachaas: 50, saath: 60,
  sattar: 70, assi: 80, nabbe: 90,
  // Devanagari
  "शून्य": 0, "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6,
  "छै": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10, "ग्यारह": 11, "बारह": 12, "तेरह": 13,
  "चौदह": 14, "पंद्रह": 15, "सोलह": 16, "सत्रह": 17, "अठारह": 18, "उन्नीस": 19,
  "बीस": 20, "तीस": 30, "चालीस": 40, "पचास": 50, "साठ": 60, "सत्तर": 70, "अस्सी": 80,
  "नब्बे": 90,
};

const MULTIPLIERS: Record<string, number> = {
  hundred: 100, sau: 100, "सौ": 100,
  thousand: 1000, hazar: 1000, hazaar: 1000, hajar: 1000, "हज़ार": 1000, "हजार": 1000,
  lakh: 100000, lac: 100000, "लाख": 100000,
  crore: 10000000, karor: 10000000, "करोड़": 10000000,
};

/** Standalone fractional words: the whole value is fixed regardless of what follows. */
const FIXED_FRACTIONS: Record<string, number> = {
  half: 0.5, aadha: 0.5, adha: 0.5, aadhaa: 0.5, "आधा": 0.5,
  quarter: 0.25, pav: 0.25, pao: 0.25, "पाव": 0.25,
  dedh: 1.5, derh: 1.5, deodh: 1.5, "डेढ़": 1.5,
  dhai: 2.5, dai: 2.5, "ढाई": 2.5,
};

/** Modifier words that adjust the number that FOLLOWS them. */
const MODIFIERS: Record<string, (n: number) => number> = {
  sava: (n) => n + 0.25, sawa: (n) => n + 0.25, "सवा": (n) => n + 0.25,
  sadhe: (n) => n + 0.5, saadhe: (n) => n + 0.5, "साढ़े": (n) => n + 0.5,
  paune: (n) => n - 0.25, pone: (n) => n - 0.25, "पौने": (n) => n - 0.25,
};

const DECIMAL_MARKERS = new Set(["point", "dot", "dashamlav", "दशमलव"]);
const JOINERS = new Set(["and", "aur", "और", "&", "-"]);

const DEVANAGARI_DIGITS: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
  "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
};

const toAsciiDigits = (value: string): string =>
  value.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] ?? d);

/** Trims trailing zeros so 2.50 and 2.5 compare equal downstream. */
function toDecimalString(value: number): string {
  if (!Number.isFinite(value)) return "0";
  // Quantities on site are never more precise than 3 decimals.
  const fixed = value.toFixed(3);
  return fixed.replace(/\.?0+$/, "") || "0";
}

export const tokenizeSpokenNumber = (text: string): string[] =>
  toAsciiDigits(text.toLowerCase())
    .replace(/[,؍]/g, "")
    .split(/[\s/]+/)
    .map((t) => t.replace(/^[^0-9a-zऀ-ॿ.]+|[^0-9a-zऀ-ॿ.]+$/g, ""))
    .filter(Boolean);

/**
 * Parses the FIRST quantity expressed anywhere in a phrase.
 * Returns null when nothing numeric is present — callers must treat that as "not stated".
 */
export function parseSpokenQuantity(text: string): string | null {
  const tokens = tokenizeSpokenNumber(text);
  // Held in a box rather than a bare `let`: `flushCurrent` mutates it from a closure, and
  // TypeScript's control-flow analysis would otherwise narrow the outer reads to `never`.
  const acc: { total: number | null } = { total: null };
  let current: number | null = null; // value being built before a multiplier applies
  let pendingModifier: ((n: number) => number) | null = null;
  let decimalDigits: string | null = null;
  let started = false;

  const flushCurrent = () => {
    if (current !== null) {
      acc.total = (acc.total ?? 0) + current;
      current = null;
    }
  };

  for (const token of tokens) {
    if (decimalDigits !== null) {
      // Collect digits after a decimal marker: "two point four five".
      const digit = /^\d$/.test(token) ? token : UNITS[token] !== undefined && UNITS[token] < 10
        ? String(UNITS[token]) : null;
      if (digit !== null) { decimalDigits += digit; continue; }
      break; // decimal run ended
    }

    if (JOINERS.has(token)) continue;

    if (DECIMAL_MARKERS.has(token)) {
      if (!started) continue;
      decimalDigits = "";
      continue;
    }

    if (MODIFIERS[token] !== undefined) {
      pendingModifier = MODIFIERS[token];
      started = true;
      continue;
    }

    if (FIXED_FRACTIONS[token] !== undefined) {
      const value = FIXED_FRACTIONS[token];
      // "aadha" after a number means "and a half": do aadha -> 2.5
      if (current !== null && value === 0.5) current += 0.5;
      else if (acc.total !== null && current === null && value === 0.5) acc.total += 0.5;
      else current = (current ?? 0) + value;
      started = true;
      continue;
    }

    const numeric = /^\d+(\.\d+)?$/.test(token) ? Number(token) : undefined;
    const word = UNITS[token];

    if (numeric !== undefined || word !== undefined) {
      let value = numeric ?? word!;
      if (pendingModifier) { value = pendingModifier(value); pendingModifier = null; }
      // Tens + units compose ("twenty five"), otherwise a new number starts.
      current = current !== null && current % 10 === 0 && current >= 20 && value < 10
        ? current + value
        : (current ?? 0) + value;
      started = true;
      continue;
    }

    const multiplier = MULTIPLIERS[token];
    if (multiplier !== undefined) {
      const base = current ?? (started ? 0 : 1);
      current = (base === 0 ? 1 : base) * multiplier;
      flushCurrent();
      started = true;
      continue;
    }

    if (started) break; // a non-numeric word ends the quantity
  }

  flushCurrent();
  if (acc.total === null) return null;
  let result = acc.total;
  if (decimalDigits) {
    const fraction = Number(`0.${decimalDigits}`);
    if (Number.isFinite(fraction)) result += fraction;
  }
  return toDecimalString(result);
}
