import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// scrypt via node:crypto — no external dependency. Parameters follow OWASP guidance
// (N=2^15, r=8, p=1) and are embedded in the stored string so they can be raised later
// without invalidating existing hashes.
const N = 2 ** 15, R = 8, P = 1, KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * 1024 * 1024 });
  return `scrypt:${N}:${R}:${P}:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(keyB64, "base64url");
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
