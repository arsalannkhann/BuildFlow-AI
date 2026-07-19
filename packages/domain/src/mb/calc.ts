import { cmpDecimal, isDecimalString, mulDecimal, normalizeDecimal } from "../decimal";

// Measurement Book (e-MB Preview) quantity calculation — pure and deterministic.
// quantity = product of the PROVIDED dimensions × count; the formula string records
// exactly which dimensions participated (e.g. "L×B×D×n"). The server always recomputes
// with this function and refuses client-supplied quantities that do not match.

export type MbDimensions = {
  length?: string | null; // decimal strings, never floats (rules.md §7)
  breadth?: string | null;
  depth?: string | null;
  count?: number | null;
};

export type MbQuantity = { quantity: string; formula: string };

export function computeMbQuantity(dims: MbDimensions): MbQuantity {
  const parts: { symbol: string; value: string }[] = [];
  for (const [symbol, value] of [["L", dims.length], ["B", dims.breadth], ["D", dims.depth]] as const) {
    if (value == null || value === "") continue;
    if (!isDecimalString(value)) throw new Error(`${symbol} must be a decimal number`);
    if (cmpDecimal(value, "0") <= 0) throw new Error(`${symbol} must be positive`);
    parts.push({ symbol, value: normalizeDecimal(value) });
  }
  if (dims.count != null) {
    if (!Number.isInteger(dims.count) || dims.count <= 0) throw new Error("Count must be a positive whole number");
    parts.push({ symbol: "n", value: String(dims.count) });
  }
  if (parts.length === 0) throw new Error("Provide at least one dimension or a count");
  let quantity = "1";
  for (const part of parts) quantity = mulDecimal(quantity, part.value);
  return { quantity: normalizeDecimal(quantity), formula: parts.map((p) => p.symbol).join("×") };
}

/** True when a client-supplied quantity matches the server-computed one exactly. */
export function quantityMatches(dims: MbDimensions, claimed: string): boolean {
  if (!isDecimalString(claimed)) return false;
  return cmpDecimal(computeMbQuantity(dims).quantity, claimed) === 0;
}
