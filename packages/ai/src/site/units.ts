/**
 * Report-label view of the canonical unit table in `@buildflow/domain/resolve/units`.
 *
 * WHY THIS ADAPTER EXISTS: the domain layer stores a unit by its canonical CODE ("m3", "m2",
 * "mt") because that is what a stored quantity is compared and converted by. An Indian DPR,
 * a Measurement Book line and these evals all read the industry label ("cum", "sqm", "MT").
 * Both are needed and neither can be dropped, so the code is the stored value and this module
 * is the only place that turns it into the written one.
 *
 * What it no longer does is own a second alias table. Until this change the two layers
 * disagreed on the canonical value for the same spoken word — "cubic meter" resolved to
 * "cum" here and to "m3" there — so a quantity extracted by the AI layer and a quantity
 * resolved by the resolution layer did not compare equal. There is now one table, one alias
 * list and one set of conversion factors behind both.
 */

import {
  CANONICAL_UNITS as UNIT_TABLE, resolveSpokenUnit, resolveUnit, type UnitDisplay,
} from "@buildflow/domain/resolve/units";

/** Every unit label that may be written onto a report, in dimension order. */
export const CANONICAL_UNITS: readonly UnitDisplay[] =
  Object.values(UNIT_TABLE).map((unit) => unit.display);

export type CanonicalUnit = (typeof CANONICAL_UNITS)[number];

const fold = (value: string): string =>
  value.toLowerCase().replaceAll(".", " ").replace(/\s+/g, " ").trim();

/** Canonical unit label for a unit string, or null when the unit is not recognised. */
export function normalizeUnit(raw: string | null | undefined): CanonicalUnit | null {
  return resolveUnit(raw)?.display ?? null;
}

/**
 * Same, for a unit read out of RUNNING SPEECH rather than a unit field. Declines the alias
 * spellings that are ordinary words, so "two in the afternoon" is not two inches.
 */
export function normalizeSpokenUnit(raw: string | null | undefined): CanonicalUnit | null {
  return resolveSpokenUnit(raw)?.display ?? null;
}

/**
 * True when two unit strings mean the same measurement. Used by the eval scorer so a
 * provider is not marked wrong for saying "cubic meter" where the fixture says "cum".
 * An unrecognised unit falls back to its own folded text: two unknown units may still be
 * equal to each other, but an unknown unit never silently equals a known one.
 */
export function sameUnit(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  const left = normalizeUnit(a) ?? fold(a);
  const right = normalizeUnit(b) ?? fold(b);
  return left === right;
}
