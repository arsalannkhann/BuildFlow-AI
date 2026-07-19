import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { authCredentials, passwordResets, sessions, users } from "@buildflow/db/schema";
import { withAuthBootstrap } from "@buildflow/db/tenant";
import { hashPassword, verifyPassword } from "@buildflow/domain/security/password";

const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MIN_PASSWORD_LENGTH = 12;

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export class ResetError extends Error {
  constructor(public code: "invalid_token" | "weak_password" | "wrong_password", message: string) {
    super(message);
  }
}

const assertStrongPassword = (password: string) => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ResetError("weak_password", `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
};

/**
 * Creates a single-use reset token for the account with this email. Returns null when no
 * active account exists — callers MUST behave identically in both cases so responses never
 * reveal whether an email is registered.
 */
export async function createPasswordReset(
  db: AppDb, email: string,
): Promise<{ token: string; userId: string; expiresAt: Date } | null> {
  // Pre-authentication, like sign-in: without the bootstrap RLS hides the account and the
  // caller cannot tell "no such user" from "reset silently skipped".
  const [user] = await withAuthBootstrap(db, (tx) => tx.select().from(users).where(and(
    eq(users.email, email.trim().toLowerCase()), eq(users.isActive, true),
  )));
  if (!user) return null;
  return createPasswordResetForUser(db, user.id);
}

/** Admin path: a member-manager generates a reset link for a locked-out member. */
export async function createPasswordResetForUser(
  db: AppDb, userId: string,
): Promise<{ token: string; userId: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.insert(passwordResets).values({ id: tokenHash(token), userId, expiresAt });
  return { token, userId, expiresAt };
}

/**
 * Consumes a reset token: sets the new password and revokes every session for the user.
 * Single-use and expiring; all failures surface as the same "invalid_token" to the caller
 * except password strength, which is safe to explain.
 */
export async function consumePasswordReset(
  db: AppDb, token: string, newPassword: string,
): Promise<{ userId: string }> {
  assertStrongPassword(newPassword);
  const id = tokenHash(token);
  const [row] = await db.select().from(passwordResets).where(and(
    eq(passwordResets.id, id), isNull(passwordResets.usedAt),
  ));
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    throw new ResetError("invalid_token", "This reset link is invalid or has expired");
  }
  const passwordHash = hashPassword(newPassword);
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, id));
    await tx.insert(authCredentials)
      .values({ userId: row.userId, passwordHash })
      .onConflictDoUpdate({
        target: authCredentials.userId,
        set: { passwordHash, updatedAt: new Date() },
      });
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
  });
  return { userId: row.userId };
}

/**
 * Signed-in password change: verifies the current password, sets the new one, and revokes
 * every OTHER session (the current one stays valid so the user is not logged out).
 */
export async function changePassword(
  db: AppDb, userId: string, currentPassword: string, newPassword: string,
  currentSessionToken?: string,
): Promise<void> {
  assertStrongPassword(newPassword);
  const [cred] = await db.select().from(authCredentials)
    .where(eq(authCredentials.userId, userId));
  if (!cred || !verifyPassword(currentPassword, cred.passwordHash)) {
    throw new ResetError("wrong_password", "Current password is incorrect");
  }
  const passwordHash = hashPassword(newPassword);
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    await tx.update(authCredentials)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(authCredentials.userId, userId));
    if (currentSessionToken) {
      await tx.delete(sessions).where(and(
        eq(sessions.userId, userId),
        ne(sessions.id, createHash("sha256").update(currentSessionToken).digest("hex")),
      ));
    } else {
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    }
  });
}

/** Housekeeping: drop expired/used reset rows (called from the retention sweep). */
export async function deleteStaleResets(db: AppDb): Promise<void> {
  await db.execute(sql`delete from "password_reset" where expires_at < now() or used_at is not null`);
}
