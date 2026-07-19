// Money is ALWAYS integer minor units (paise) + ISO currency code "INR" (rules.md §7).
// Display uses Indian digit grouping: ₹12,34,567.89 (last three digits, then pairs).

const groupIndian = (whole: string): string => {
  if (whole.length <= 3) return whole;
  const last3 = whole.slice(-3);
  let rest = whole.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${parts.join(",")},${last3}`;
};

/** 123456789 paise -> "₹12,34,567.89". */
export function formatINR(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new Error(`Money must be integer paise, got: ${paise}`);
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100).toString();
  const minor = (abs % 100).toString().padStart(2, "0");
  return `${neg ? "-" : ""}₹${groupIndian(rupees)}.${minor}`;
}

const INR_RE = /^-?\d+(\.\d{1,2})?$/;

/** "12,34,567.89" | "₹1,234" | "1234.5" -> integer paise. Throws on anything else. */
export function parseINRToPaise(text: string): number {
  const cleaned = text.trim().replace(/[₹,\s]/g, "");
  if (!INR_RE.test(cleaned)) throw new Error(`Not an INR amount: "${text}"`);
  const neg = cleaned.startsWith("-");
  const [whole, frac = ""] = (neg ? cleaned.slice(1) : cleaned).split(".");
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(paise)) throw new Error(`INR amount out of range: "${text}"`);
  return neg ? -paise : paise;
}

/**
 * quantity (decimal string) × rate (integer paise) -> integer paise, rounded half-up.
 * Exact scaled-integer arithmetic; never floats.
 */
export function mulQuantityPaise(quantity: string, ratePaise: number): number {
  if (!Number.isSafeInteger(ratePaise)) throw new Error("Rate must be integer paise");
  const t = quantity.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`Not a decimal quantity: "${quantity}"`);
  const neg = t.startsWith("-") !== ratePaise < 0;
  const body = t.replace("-", "");
  const [whole, frac = ""] = body.split(".");
  const units = BigInt(whole + frac);
  const denom = 10n ** BigInt(frac.length);
  const num = units * BigInt(Math.abs(ratePaise));
  const half = denom / 2n;
  const rounded = (num + half) / denom; // half-up on non-negative operands
  const out = Number(rounded);
  if (!Number.isSafeInteger(out)) throw new Error("Amount out of safe integer range");
  return neg ? -out : out;
}
