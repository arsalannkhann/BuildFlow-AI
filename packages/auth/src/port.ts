import type { AppDb } from "@buildflow/db/client";

export type SessionUser = { userId: string };

// Portable authentication boundary (Architecture.MD §4): the dev adapter implements it with
// local credentials + server-side sessions; the Supabase adapter implements the same port
// with verified Supabase JWTs. Business authorization stays in BuildFlow either way.
export interface AuthPort {
  signInWithPassword(db: AppDb, email: string, password: string):
    Promise<{ token: string; userId: string; expiresAt: Date } | null>;
  verifySession(db: AppDb, token: string): Promise<SessionUser | null>;
  signOut(db: AppDb, token: string): Promise<void>;
}
