// Exact decimal arithmetic on numeric STRINGS (rules.md §7: measured quantities are
// decimal values, never binary floating point). Values are scaled BigInts internally;
// results are normalized strings ("1.50" -> "1.5", "-0" -> "0").

const DEC_RE = /^-?\d+(\.\d+)?$/;

export const isDecimalString = (s: string): boolean => DEC_RE.test(s.trim());

type Scaled = { units: bigint; scale: number };

function parse(s: string): Scaled {
  const t = s.trim();
  if (!DEC_RE.test(t)) throw new Error(`Not a decimal number: "${s}"`);
  const neg = t.startsWith("-");
  const body = neg ? t.slice(1) : t;
  const [whole, frac = ""] = body.split(".");
  const units = BigInt(whole + frac) * (neg ? -1n : 1n);
  return { units, scale: frac.length };
}

function rescale(a: Scaled, scale: number): bigint {
  return a.units * 10n ** BigInt(scale - a.scale);
}

function toString(units: bigint, scale: number): string {
  const neg = units < 0n;
  let digits = (neg ? -units : units).toString().padStart(scale + 1, "0");
  let whole = digits.slice(0, digits.length - scale);
  let frac = scale > 0 ? digits.slice(digits.length - scale) : "";
  frac = frac.replace(/0+$/, "");
  const out = frac ? `${whole}.${frac}` : whole;
  return neg && out !== "0" ? `-${out}` : out;
}

export function addDecimal(a: string, b: string): string {
  const pa = parse(a); const pb = parse(b);
  const scale = Math.max(pa.scale, pb.scale);
  return toString(rescale(pa, scale) + rescale(pb, scale), scale);
}

export function mulDecimal(a: string, b: string): string {
  const pa = parse(a); const pb = parse(b);
  return toString(pa.units * pb.units, pa.scale + pb.scale);
}

/** -1, 0, or 1 for a <=> b. */
export function cmpDecimal(a: string, b: string): number {
  const pa = parse(a); const pb = parse(b);
  const scale = Math.max(pa.scale, pb.scale);
  const ua = rescale(pa, scale); const ub = rescale(pb, scale);
  return ua < ub ? -1 : ua > ub ? 1 : 0;
}

/** Normalizes a decimal string ("02.50" -> "2.5"); throws on non-decimals. */
export function normalizeDecimal(s: string): string {
  const p = parse(s);
  return toString(p.units, p.scale);
}
