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

export type CanonicalUnit = {
  code: string;            // canonical code stored with the quantity
  dimension: UnitDimension;
  label: string;           // how it is displayed
  /** Multiply a value in this unit by this factor to get the dimension's base unit. */
  toBase: string;
};

/** Base units per dimension: m, m2, m3, kg, nos, hour. */
export const CANONICAL_UNITS: Record<string, CanonicalUnit> = {
  m: { code: "m", dimension: "length", label: "m", toBase: "1" },
  cm: { code: "cm", dimension: "length", label: "cm", toBase: "0.01" },
  mm: { code: "mm", dimension: "length", label: "mm", toBase: "0.001" },
  ft: { code: "ft", dimension: "length", label: "ft", toBase: "0.3048" },
  in: { code: "in", dimension: "length", label: "in", toBase: "0.0254" },

  m2: { code: "m2", dimension: "area", label: "sqm", toBase: "1" },
  ft2: { code: "ft2", dimension: "area", label: "sqft", toBase: "0.09290304" },

  m3: { code: "m3", dimension: "volume", label: "cum", toBase: "1" },
  ft3: { code: "ft3", dimension: "volume", label: "cft", toBase: "0.028316846592" },
  // 1 brass = 100 cft, the standard Indian aggregate/sand trading unit.
  brass: { code: "brass", dimension: "volume", label: "brass", toBase: "2.8316846592" },
  l: { code: "l", dimension: "volume", label: "litre", toBase: "0.001" },

  kg: { code: "kg", dimension: "mass", label: "kg", toBase: "1" },
  mt: { code: "mt", dimension: "mass", label: "MT", toBase: "1000" },
  quintal: { code: "quintal", dimension: "mass", label: "quintal", toBase: "100" },

  nos: { code: "nos", dimension: "count", label: "nos", toBase: "1" },
  bag: { code: "bag", dimension: "count", label: "bag", toBase: "1" },
  trip: { code: "trip", dimension: "count", label: "trip", toBase: "1" },

  hour: { code: "hour", dimension: "time", label: "hour", toBase: "1" },
  day: { code: "day", dimension: "time", label: "day", toBase: "8" },
};

/**
 * Spoken/written forms mapped to canonical codes. Keys are matched after normalisation
 * (lower-cased, punctuation and inner spaces stripped) so "sq. m." and "sq m" both hit.
 */
const UNIT_ALIASES: Record<string, string> = {
  // volume
  cum: "m3", cubicmeter: "m3", cubicmetre: "m3", cubicmeters: "m3", cubicmetres: "m3",
  m3: "m3", cbm: "m3", ghanmeter: "m3", ghanmetre: "m3", "घनमीटर": "m3", meter3: "m3",
  cft: "ft3", cubicfeet: "ft3", cubicfoot: "ft3", ft3: "ft3", cubicft: "ft3",
  brass: "brass", "ब्रास": "brass",
  litre: "l", liter: "l", l: "l", ltr: "l", "लीटर": "l",
  // area
  sqm: "m2", squaremeter: "m2", squaremetre: "m2", squaremeters: "m2", m2: "m2",
  vargmeter: "m2", "वर्गमीटर": "m2", meter2: "m2",
  sqft: "ft2", squarefeet: "ft2", squarefoot: "ft2", ft2: "ft2", sft: "ft2",
  // length
  m: "m", meter: "m", metre: "m", meters: "m", metres: "m", "मीटर": "m",
  cm: "cm", centimeter: "cm", centimetre: "cm",
  mm: "mm", millimeter: "mm", millimetre: "mm",
  ft: "ft", feet: "ft", foot: "ft", "फीट": "ft", "फुट": "ft",
  in: "in", inch: "in", inches: "in", "इंच": "in",
  // mass
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg", "किलो": "kg",
  mt: "mt", ton: "mt", tonne: "mt", tons: "mt", tonnes: "mt", metricton: "mt", "टन": "mt",
  quintal: "quintal", qtl: "quintal", "क्विंटल": "quintal",
  // count
  nos: "nos", no: "nos", number: "nos", numbers: "nos", pcs: "nos", pieces: "nos",
  piece: "nos", each: "nos", unit: "nos", units: "nos", adad: "nos", "नग": "nos",
  bag: "bag", bags: "bag", bori: "bag", boriyan: "bag", "बोरी": "bag", "बैग": "bag",
  trip: "trip", trips: "trip", load: "trip", loads: "trip", dumper: "trip", "ट्रिप": "trip",
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

/** True when two units measure the same dimension and are therefore comparable. */
export function unitsComparable(a: string, b: string): boolean {
  const left = resolveUnit(a);
  const right = resolveUnit(b);
  return Boolean(left && right && left.dimension === right.dimension);
}

/** Unit alias pairs for seeding the alias dictionary. */
export const unitAliasSeeds = (): { alias: string; canonicalValue: string }[] =>
  Object.entries(UNIT_ALIASES).map(([alias, canonicalValue]) => ({ alias, canonicalValue }));
