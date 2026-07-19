import { join, isAbsolute } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector as pgliteVector } from "@electric-sql/pglite/vector";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { schema } from "./schema";
import { migrationsDir, workspaceRoot } from "./workspace-root";

// One query surface over two drivers (ADR-0002): real PostgreSQL when DATABASE_URL is set
// (Docker locally, managed in production), embedded PGlite otherwise (zero-dependency dev
// and hermetic tests). Both are Postgres; the casts below erase only the driver-specific
// query-result HKT, which no caller depends on.
export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export async function createDb(dataDir?: string): Promise<AppDb> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: migrationsDir() });
    return db as unknown as AppDb;
  }
  const configured = dataDir ?? process.env.PGLITE_DATA_DIR ?? ".pglite";
  const resolved = isAbsolute(configured) ? configured : join(workspaceRoot(), configured);
  // pgvector ships inside PGlite; migration 0009 CREATEs the extension. Real PG images
  // (docker-compose, CI, Supabase) are pgvector-enabled already.
  const pglite = new PGlite(resolved, { extensions: { vector: pgliteVector } });
  const db = drizzlePglite(pglite, { schema });
  await migratePglite(db, { migrationsFolder: migrationsDir() });
  return db as unknown as AppDb;
}

// Anchor the singleton on globalThis, not a module-level `let`. Under Next.js dev
// bundling the RSC page module and the "use server" action module are compiled
// separately, so a plain module cache produces two independent PGlite connections
// against the same on-disk directory that don't see each other's writes. Caching the
// in-flight Promise on globalThis keeps a single shared connection across all bundles
// in the process.
const dbGlobal = globalThis as unknown as { __buildflowDb?: Promise<AppDb> };

export function getDb(): Promise<AppDb> {
  if (!dbGlobal.__buildflowDb) dbGlobal.__buildflowDb = createDb();
  return dbGlobal.__buildflowDb;
}

export async function createTestDb(): Promise<AppDb> {
  const pglite = new PGlite({ extensions: { vector: pgliteVector } }); // in-memory
  const db = drizzlePglite(pglite, { schema });
  await migratePglite(db, { migrationsFolder: migrationsDir() });
  return db as unknown as AppDb;
}
