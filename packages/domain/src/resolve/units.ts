/**
 * Unit canonicalisation for Indian construction measurement.
 *
 * "cum", "cubic meter", "ghan meter", "CBM", "घन मीटर" and "m3" are the same unit; "brass"
 * is 100 cft; a cement "bag" is a count that happens to weigh 50 kg. Without canonical
 * units a quantity cannot be summed, compared to a BOQ line, or posted to a stock ledger —
 * every downstream number silently becomes wrong.
 *
 * Conversions are exact decimal strings where the definition is exact, and documented
 * approximations where the definition is not. Nothing here guesses: an unknown unit stays
 * unknown and the raw text is preserved for the reviewer.
 */

export type UnitDimension = "length" | "area" | "volume" | "mass" | "count" | "time";

/**
 * How a unit is WRITTEN on a DPR, a Measurement Book line or a screen. An Indian
 * construction report reads "cum", "sqm", "cft", "MT" and "nos"; it never reads "m3" or
 * "m2". The set is closed on purpose: a display label reaching an issued document has to be
 * one a quantity surveyor recognises, so a new one is a reviewed change to this union rather
 * than a free-text string a caller invents.
 */
export type UnitDisplay =
  | "m" | "cm" | "mm" | "ft" | "in" | "rmt"
  | "sqm" | "sqft"
  | "cum" | "cft" | "brass" | "litre"
  | "kg" | "MT" | "quintal"
  | "nos" | "bag" | "trip"
  | "hour" | "day";

export type CanonicalUnit = {
  code: string;            // canonical code stored with the quantity
  dimension: UnitDimension;
  /** The industry label written onto a report; `code` is what is stored and compared. */
  display: UnitDisplay;
  /** Multiply a value in this unit by this factor to get the dimension's base unit. */
  toBase: string;
};

/** Base units per dimension: m, m2, m3, kg, nos, hour. */
export const CANONICAL_UNITS: Record<string, CanonicalUnit> = {
  m: { code: "m", dimension: "length", display: "m", toBase: "1" },
  cm: { code: "cm", dimension: "length", display: "cm", toBase: "0.01" },
  mm: { code: "mm", dimension: "length", display: "mm", toBase: "0.001" },
  ft: { code: "ft", dimension: "length", display: "ft", toBase: "0.3048" },
  in: { code: "in", dimension: "length", display: "in", toBase: "0.0254" },
  // Running metre is its own BOQ/MB measurement basis for linear items (skirting, railing,
  // pipe laying) and a report must print "rmt". It is exactly one metre, so it stays
  // comparable with `m` and converts without loss — the code is separate only so the
  // measurement basis the engineer actually stated survives onto the document.
  rmt: { code: "rmt", dimension: "length", display: "rmt", toBase: "1" },

  m2: { code: "m2", dimension: "area", display: "sqm", toBase: "1" },
  ft2: { code: "ft2", dimension: "area", display: "sqft", toBase: "0.09290304" },

  m3: { code: "m3", dimension: "volume", display: "cum", toBase: "1" },
  ft3: { code: "ft3", dimension: "volume", display: "cft", toBase: "0.028316846592" },
  // 1 brass = 100 cft, the standard Indian aggregate/sand trading unit.
  brass: { code: "brass", dimension: "volume", display: "brass", toBase: "2.8316846592" },
  l: { code: "l", dimension: "volume", display: "litre", toBase: "0.001" },

  kg: { code: "kg", dimension: "mass", display: "kg", toBase: "1" },
  mt: { code: "mt", dimension: "mass", display: "MT", toBase: "1000" },
  quintal: { code: "quintal", dimension: "mass", display: "quintal", toBase: "100" },

  nos: { code: "nos", dimension: "count", display: "nos", toBase: "1" },
  bag: { code: "bag", dimension: "count", display: "bag", toBase: "1" },
  trip: { code: "trip", dimension: "count", display: "trip", toBase: "1" },

  hour: { code: "hour", dimension: "time", display: "hour", toBase: "1" },
  day: { code: "day", dimension: "time", display: "day", toBase: "8" },
};

/**
 * Spoken/written forms mapped to canonical codes. Keys are matched after normalisation
 * (lower-cased, punctuation and inner spaces stripped) so "sq. m." and "sq m" both hit.
 */
const UNIT_ALIASES: Record<string, string> = {
  // volume
  cum: "m3", cubicmeter: "m3", cubicmetre: "m3", cubicmeters: "m3", cubicmetres: "m3",
  m3: "m3", cbm: "m3", ghanmeter: "m3", ghanmetre: "m3", "घनमीटर": "m3", meter3: "m3",
  cumeter: "m3", cumetre: "m3",
  cft: "ft3", cubicfeet: "ft3", cubicfoot: "ft3", ft3: "ft3", cubicft: "ft3",
  cuft: "ft3", ghanfoot: "ft3",
  brass: "brass", "ब्रास": "brass",
  litre: "l", liter: "l", litres: "l", liters: "l", l: "l", ltr: "l", "लीटर": "l",
  // area
  sqm: "m2", squaremeter: "m2", squaremetre: "m2", squaremeters: "m2", squaremetres: "m2",
  m2: "m2", vargmeter: "m2", "वर्गमीटर": "m2", meter2: "m2",
  sqft: "ft2", squarefeet: "ft2", squarefoot: "ft2", ft2: "ft2", sft: "ft2",
  // length
  m: "m", meter: "m", metre: "m", meters: "m", metres: "m", "मीटर": "m",
  cm: "cm", centimeter: "cm", centimetre: "cm",
  mm: "mm", millimeter: "mm", millimetre: "mm",
  ft: "ft", feet: "ft", foot: "ft", "फीट": "ft", "फुट": "ft",
  in: "in", inch: "in", inches: "in", "इंच": "in",
  rmt: "rmt", rm: "rmt", runningmeter: "rmt", runningmetre: "rmt",
  // mass
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg", "किलो": "kg",
  mt: "mt", ton: "mt", tonne: "mt", tons: "mt", tonnes: "mt", metricton: "mt",
  metrictonne: "mt", "टन": "mt",
  quintal: "quintal", qtl: "quintal", "क्विंटल": "quintal",
  // count
  nos: "nos", no: "nos", number: "nos", numbers: "nos", pcs: "nos", pieces: "nos",
  piece: "nos", each: "nos", unit: "nos", units: "nos", adad: "nos", "नग": "nos",
  bag: "bag", bags: "bag", bori: "bag", boriyan: "bag", boriya: "bag", borey: "bag",
  "बोरी": "bag", "बैग": "bag",
  trip: "trip", trips: "trip", load: "trip", loads: "trip", dumper: "trip", phera: "trip",
  "ट्रिप": "trip",
  // time
  hour: "hour", hours: "hour", hr: "hour", hrs: "hour", ghanta: "hour", "घंटा": "hour",
  day: "day", days: "day", din: "day", "दिन": "day",
};

/**
 * Material-specific pack weights. Only used when a reviewer explicitly asks to convert a
 * count into mass — never applied silently, because "1 bag" means 50 kg for cement and
 * something else entirely for other materials.
 */
export const PACK_WEIGHTS_KG: Record<string, string> = {
  cement: "50",
  "white cement": "40",
};

export const normalizeUnitText = (text: string): string =>
  text.toLowerCase().normalize("NFC").replace(/[^0-9a-zऀ-ॿ]/g, "");

/** Resolves a spoken/written unit to its canonical form, or null when unrecognised. */
export function resolveUnit(text: string | null | undefined): CanonicalUnit | null {
  if (!text) return null;
  const key = normalizeUnitText(text);
  if (!key) return null;
  const code = UNIT_ALIASES[key] ?? (CANONICAL_UNITS[key] ? key : undefined);
  return code ? CANONICAL_UNITS[code] ?? null : null;
}

/**
 * Unit spellings that are ordinary words in running speech.
 *
 * "in" is the abbreviation for inch AND the most common English preposition. Resolving a unit
 * FIELD it is a unit — a reviewer who types "in" means inches. Scanning a transcript for the
 * words after a number it is not: "heavy rain from two in the afternoon" would otherwise be
 * read as a measurement of two inches and attached to the work item as the stated quantity.
 */
const SPEECH_AMBIGUOUS_ALIASES = new Set(["in"]);

/**
 * Resolves a unit encountered while scanning running speech. Same table as `resolveUnit`,
 * minus the spellings that are ordinary words — a scanner has no field label to tell it that
 * the speaker meant a unit, so it must decline the ambiguous ones.
 */
export function resolveSpokenUnit(text: string | null | undefined): CanonicalUnit | null {
  if (!text) return null;
  if (SPEECH_AMBIGUOUS_ALIASES.has(normalizeUnitText(text))) return null;
  return resolveUnit(text);
}

/**
 * The report label for a canonical code, or null when the code is not one of ours.
 * Every surface that shows or prints a unit goes through this rather than echoing the stored
 * code, so an issued document can never read "m3" where the trade expects "cum".
 */
export function unitDisplay(code: string | null | undefined): UnitDisplay | null {
  if (!code) return null;
  return CANONICAL_UNITS[code]?.display ?? null;
}

/** True when two units measure the same dimension and are therefore comparable. */
export function unitsComparable(a: string, b: string): boolean {
  const left = resolveUnit(a);
  const right = resolveUnit(b);
  return Boolean(left && right && left.dimension === right.dimension);
}

/** Unit alias pairs for seeding the alias dictionary. */
export const unitAliasSeeds = (): { alias: string; canonicalValue: string }[] =>
  Object.entries(UNIT_ALIASES).map(([alias, canonicalValue]) => ({ alias, canonicalValue }));
