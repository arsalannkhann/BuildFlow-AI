import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED, DEMO_PASSWORD } from "@buildflow/db/seed";
import { DevAuthAdapter } from "./dev";
import { resolveTenantContext } from "./context";

test("sign-in, session verify, and sign-out round-trip", async () => {
  const db = await createTestDb();
  await seed(db);
  const auth = new DevAuthAdapter();

  expect(await auth.signInWithPassword(db, SEED.engineer.email, "wrong-password")).toBeNull();
  expect(await auth.signInWithPassword(db, "nobody@example.com", DEMO_PASSWORD)).toBeNull();

  const signedIn = await auth.signInWithPassword(db, SEED.engineer.email, DEMO_PASSWORD);
  expect(signedIn).not.toBeNull();
  expect(await auth.verifySession(db, signedIn!.token)).toEqual({ userId: SEED.engineer.id });

  // the raw token is never stored server-side
  const raw = await db.execute(sql`select id from session`);
  const rows = (raw as unknown as { rows: { id: string }[] }).rows;
  expect(rows.some((r) => r.id === signedIn!.token)).toBe(false);

  await auth.signOut(db, signedIn!.token);
  expect(await auth.verifySession(db, signedIn!.token)).toBeNull();
});

test("expired sessions fail verification", async () => {
  const db = await createTestDb();
  await seed(db);
  const auth = new DevAuthAdapter();
  const signedIn = await auth.signInWithPassword(db, SEED.manager.email, DEMO_PASSWORD);
  await db.execute(sql`update session set expires_at = now() - interval '1 minute'`);
  expect(await auth.verifySession(db, signedIn!.token)).toBeNull();
});

test("resolveTenantContext merges membership capabilities and rejects unknown users", async () => {
  const db = await createTestDb();
  await seed(db);
  const ctx = await resolveTenantContext(db, SEED.manager.id);
  expect(ctx.organizationId).toBe(SEED.orgId);
  expect(ctx.projectId).toBe(SEED.projectId);
  expect(ctx.capabilities).toContain("report.approve");
  expect(ctx.capabilities).not.toContain("org.manage");
  await expect(resolveTenantContext(db, "nobody")).rejects.toThrow(/unknown user/i);
});
