import { expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED, DEMO_PASSWORD } from "@buildflow/db/seed";
import { DevAuthAdapter } from "./dev";
import { resolveTenantContext } from "./context";
import { createPasswordReset } from "./reset";

// Every other auth test runs as the PGlite superuser, which bypasses RLS and therefore
// cannot see this class of bug. Production connects as `buildflow_app` — no BYPASSRLS, and
// `user`/`membership` are FORCE ROW LEVEL SECURITY — so authentication lookups, which by
// definition run before a tenant is known and thus without `app.org_id`, match zero rows.
// These tests pin the pre-auth paths to that role.
async function asAppRole<T>(db: AppDb, fn: () => Promise<T>): Promise<T> {
  await db.execute(sql`set role buildflow_app`);
  try {
    return await fn();
  } finally {
    await db.execute(sql`reset role`);
  }
}

test("sign-in succeeds under the RLS-constrained application role", async () => {
  const db = await createTestDb();
  await seed(db);
  const auth = new DevAuthAdapter();

  const signedIn = await asAppRole(db, () =>
    auth.signInWithPassword(db, SEED.engineer.email, DEMO_PASSWORD));

  expect(signedIn).not.toBeNull();
  expect(await auth.verifySession(db, signedIn!.token)).toEqual({ userId: SEED.engineer.id });
});

test("wrong credentials still fail under the application role", async () => {
  const db = await createTestDb();
  await seed(db);
  const auth = new DevAuthAdapter();

  await asAppRole(db, async () => {
    expect(await auth.signInWithPassword(db, SEED.engineer.email, "wrong-password")).toBeNull();
    expect(await auth.signInWithPassword(db, "nobody@example.com", DEMO_PASSWORD)).toBeNull();
  });
});

test("tenant context resolves under the application role", async () => {
  const db = await createTestDb();
  await seed(db);

  const ctx = await asAppRole(db, () => resolveTenantContext(db, SEED.engineer.id));

  expect(ctx.organizationId).toBe(SEED.orgId);
  expect(ctx.capabilities.length).toBeGreaterThan(0);
});

test("password reset issues a token under the application role", async () => {
  const db = await createTestDb();
  await seed(db);

  const reset = await asAppRole(db, () => createPasswordReset(db, SEED.engineer.email));

  expect(reset).not.toBeNull();
  expect(reset!.userId).toBe(SEED.engineer.id);
});

test("an unknown email still yields no reset token under the application role", async () => {
  const db = await createTestDb();
  await seed(db);

  expect(await asAppRole(db, () => createPasswordReset(db, "nobody@example.com"))).toBeNull();
});

// The bootstrap must not become a general-purpose RLS escape hatch: the policy behind it
// is SELECT-only, so a write finds no rows to touch (RLS filters the scan rather than
// raising) and the record is left intact.
test("the pre-auth bootstrap grants no writes", async () => {
  const db = await createTestDb();
  await seed(db);
  const { withAuthBootstrap } = await import("@buildflow/db/tenant");
  const { users } = await import("@buildflow/db/schema");

  await asAppRole(db, () => withAuthBootstrap(db, (tx) => tx.execute(
    sql`update "user" set display_name = 'tampered' where id = ${SEED.engineer.id}`,
  )));

  const [row] = await db.select().from(users).where(eq(users.id, SEED.engineer.id));
  expect(row.displayName).toBe(SEED.engineer.displayName);
});
