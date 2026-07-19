import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// Production connects as a role with no BYPASSRLS, so a tenant query outside withTenant()
// matches zero rows *silently* — pages render empty and writes no-op with no error. That
// failure mode is invisible in dev and CI, which connect as a superuser, so guard it
// structurally: any route/page/action that resolves a TenantContext and hands the db to a
// query or core must also bind the tenant GUC.
const APP_DIR = join(import.meta.dirname, "..", "app");

// Paths that legitimately reach the database without a tenant, each covered by its own
// sanctioned RLS path (drizzle 0013/0014) and by tests in packages/{auth,db}.
const PRE_TENANT_PATHS = [
  "session.ts", // verifySession + resolveTenantContext — withAuthBootstrap
  "api/v1/auth/login/route.ts", // sign-in — withAuthBootstrap
  "api/v1/auth/logout/route.ts", // session teardown, no tenant tables
  "invite/[token]/page.tsx", // token lookup — withPublicToken, inside the query itself
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [full] : [];
  });
}

test("every tenant-scoped app path binds the RLS tenant context", () => {
  const offenders = walk(APP_DIR).filter((file) => {
    const rel = file.slice(APP_DIR.length + 1);
    if (PRE_TENANT_PATHS.includes(rel)) return false;
    const source = readFileSync(file, "utf8");
    const touchesDb = source.includes("getDb()");
    const hasTenantContext = source.includes("currentContext()")
      || source.includes("requireApiAuth(")
      || source.includes("resolveTenantContext(");
    return touchesDb && hasTenantContext && !source.includes("withTenant");
  });

  expect(offenders.map((f) => f.slice(APP_DIR.length + 1))).toEqual([]);
});
