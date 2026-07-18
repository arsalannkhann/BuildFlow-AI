import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { authCredentials, sessions, users } from "@buildflow/db/schema";
import { hashPassword, verifyPassword } from "@buildflow/domain/security/password";
import type { AuthPort, SessionUser } from "./port";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export class DevAuthAdapter implements AuthPort {
  async signInWithPassword(db: AppDb, email: string, password: string) {
    const rows = await db.select({ user: users, cred: authCredentials })
      .from(users)
      .innerJoin(authCredentials, eq(authCredentials.userId, users.id))
      .where(and(eq(users.email, email.trim().toLowerCase()), eq(users.isActive, true)));
    const row = rows[0];
    // Verify against a constant-cost dummy hash when the user is unknown so response
    // timing does not reveal which emails exist.
    if (!row) { verifyPassword(password, DUMMY_HASH); return null; }
    if (!verifyPassword(password, row.cred.passwordHash)) return null;

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.insert(sessions).values({ id: tokenHash(token), userId: row.user.id, expiresAt });
    return { token, userId: row.user.id, expiresAt };
  }

  async verifySession(db: AppDb, token: string): Promise<SessionUser | null> {
    const rows = await db.select().from(sessions).where(eq(sessions.id, tokenHash(token)));
    const session = rows[0];
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await db.delete(sessions).where(eq(sessions.id, session.id));
      return null;
    }
    return { userId: session.userId };
  }

  async signOut(db: AppDb, token: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, tokenHash(token)));
  }

  /** Housekeeping hook for the worker: drop expired sessions. */
  async deleteExpiredSessions(db: AppDb): Promise<void> {
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  }
}

const DUMMY_HASH = hashPassword("dummy-password-for-timing");

export function getAuth(): AuthPort {
  // AUTH_PROVIDER=supabase will select the Supabase adapter once it lands (Phase B);
  // fail loudly on unknown values rather than silently falling back (rules.md §15).
  const provider = process.env.AUTH_PROVIDER ?? "dev";
  if (provider === "dev") return new DevAuthAdapter();
  throw new Error(`Unknown AUTH_PROVIDER: ${provider}`);
}
