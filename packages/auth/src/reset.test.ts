import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED, DEMO_PASSWORD } from "@buildflow/db/seed";
import { DevAuthAdapter } from "./dev";
import {
  changePassword, consumePasswordReset, createPasswordReset, ResetError,
} from "./reset";

const NEW_PASSWORD = "correct-horse-battery";

test("unknown email yields null (enumeration-safe); known email round-trips a reset", async () => {
  const db = await createTestDb();
  await seed(db);
  expect(await createPasswordReset(db, "nobody@example.com")).toBeNull();

  const auth = new DevAuthAdapter();
  const before = await auth.signInWithPassword(db, SEED.engineer.email, DEMO_PASSWORD);
  expect(before).not.toBeNull();

  const reset = await createPasswordReset(db, SEED.engineer.email);
  expect(reset).not.toBeNull();
  await consumePasswordReset(db, reset!.token, NEW_PASSWORD);

  // old password dead, new one works, prior session revoked
  expect(await auth.signInWithPassword(db, SEED.engineer.email, DEMO_PASSWORD)).toBeNull();
  expect(await auth.signInWithPassword(db, SEED.engineer.email, NEW_PASSWORD)).not.toBeNull();
  expect(await auth.verifySession(db, before!.token)).toBeNull();
});

test("reset tokens are single-use, expiring, and password-strength gated", async () => {
  const db = await createTestDb();
  await seed(db);
  const reset = await createPasswordReset(db, SEED.manager.email);

  await expect(consumePasswordReset(db, reset!.token, "short")).rejects.toThrow(ResetError);
  await consumePasswordReset(db, reset!.token, NEW_PASSWORD);
  await expect(consumePasswordReset(db, reset!.token, NEW_PASSWORD))
    .rejects.toThrow(/invalid or has expired/i);

  const expired = await createPasswordReset(db, SEED.manager.email);
  await db.execute(sql`update "password_reset" set expires_at = now() - interval '1 minute'
    where used_at is null`);
  await expect(consumePasswordReset(db, expired!.token, NEW_PASSWORD))
    .rejects.toThrow(/invalid or has expired/i);
  await expect(consumePasswordReset(db, "not-a-real-token", NEW_PASSWORD))
    .rejects.toThrow(/invalid or has expired/i);
});

test("changePassword verifies the current password and keeps only the current session", async () => {
  const db = await createTestDb();
  await seed(db);
  const auth = new DevAuthAdapter();
  const phone = await auth.signInWithPassword(db, SEED.engineer.email, DEMO_PASSWORD);
  const laptop = await auth.signInWithPassword(db, SEED.engineer.email, DEMO_PASSWORD);

  await expect(changePassword(db, SEED.engineer.id, "wrong-current", NEW_PASSWORD, laptop!.token))
    .rejects.toThrow(/current password/i);

  await changePassword(db, SEED.engineer.id, DEMO_PASSWORD, NEW_PASSWORD, laptop!.token);
  expect(await auth.verifySession(db, laptop!.token)).not.toBeNull(); // stays signed in
  expect(await auth.verifySession(db, phone!.token)).toBeNull();      // other device out
  expect(await auth.signInWithPassword(db, SEED.engineer.email, NEW_PASSWORD)).not.toBeNull();
});
