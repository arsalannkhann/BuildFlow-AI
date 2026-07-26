import { join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { schema } from "./schema";
import { migrationsDir, workspaceRoot } from "./workspace-root";

// PGlite is the dev/test driver only. It is loaded through dynamic import so production
// bundles (DATABASE_URL set) never require the package at all — a real deployment must not
// carry an embedded test database.
async function loadPglite() {
  const [{ PGlite }, { vector: pgliteVector }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@electric-sql/pglite/vector"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  // Next's server bundler rewrites the pgvector extension URL into `/_next/static`, while
  // PGlite's Node loader expects a filesystem asset. Point at the package-owned tarball
  // explicitly so dev/e2e and the unbundled test runner use the same deterministic source.
  const nodePgliteVector = {
    ...pgliteVector,
    setup: async (pgArg: Parameters<typeof pgliteVector.setup>[0], options: Parameters<typeof pgliteVector.setup>[1]) => ({
      ...(await pgliteVector.setup(pgArg, options)),
      bundlePath: pathToFileURL(join(
        workspaceRoot(), "packages/db/node_modules/@electric-sql/pglite/dist/vector.tar.gz",
      )),
    }),
  };
  return { PGlite, nodePgliteVector, drizzlePglite: drizzle, migratePglite: migrate };
}

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
    // Session-scoped rather than per-query: every connection this process opens belongs to
    // the worker, and pg queues this ahead of any caller's query on the same connection.
    if (dbGlobal.__buildflowDbSystem) {
      pool.on("connect", (client) => {
        void client.query("select set_config('app.system', 'on', false)");
      });
    }
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: migrationsDir() });
    return db as unknown as AppDb;
  }
  const configured = dataDir ?? process.env.PGLITE_DATA_DIR ?? ".pglite";
  const resolved = isAbsolute(configured) ? configured : join(workspaceRoot(), configured);
  // pgvector ships inside PGlite; migration 0009 CREATEs the extension. Real PG images
  // (docker-compose, CI, Supabase) are pgvector-enabled already.
  const { PGlite, nodePgliteVector, drizzlePglite, migratePglite } = await loadPglite();
  const pglite = new PGlite(resolved, { extensions: { vector: nodePgliteVector } });
  const db = drizzlePglite(pglite, { schema });
  await migratePglite(db, { migrationsFolder: migrationsDir() });
  if (dbGlobal.__buildflowDbSystem) {
    await db.execute(sql`select set_config('app.system', 'on', false)`);
  }
  return db as unknown as AppDb;
}

// Anchor the singleton on globalThis, not a module-level `let`. Under Next.js dev
// bundling the RSC page module and the "use server" action module are compiled
// separately, so a plain module cache produces two independent PGlite connections
// against the same on-disk directory that don't see each other's writes. Caching the
// in-flight Promise on globalThis keeps a single shared connection across all bundles
// in the process.
const dbGlobal = globalThis as unknown as {
  __buildflowDb?: Promise<AppDb>;
  __buildflowSystemDb?: Promise<AppDb>;
  __buildflowDbSystem?: boolean;
};

/**
 * Marks this process as a trusted system process, so its connections may read and write
 * across tenants (drizzle/0013_preauth_and_system_rls_paths.sql). Only the worker qualifies:
 * it leases jobs and runs sweeps for every organization, so its queries have no single
 * `app.org_id` to bind. Request-serving processes must never call this — they keep using
 * withTenant() per request.
 */
export function enableSystemMode(): void {
  if (dbGlobal.__buildflowDb) {
    throw new Error("enableSystemMode() must be called before the first getDb()");
  }
  dbGlobal.__buildflowDbSystem = true;
}

export function getDb(): Promise<AppDb> {
  if (!dbGlobal.__buildflowDb) dbGlobal.__buildflowDb = createDb();
  return dbGlobal.__buildflowDb;
}

/**
 * A system-mode handle for running the job pipeline from a request-serving process.
 *
 * The worker enables system mode globally, so every one of its connections carries
 * `app.system=on` and the pipeline's org-agnostic writes (processing_run, revisions, entity
 * links) satisfy the `system_access` RLS policy. A web process CANNOT enable system mode
 * globally — its request connections must stay tenant-isolated — but under JOBS_MODE=inline it
 * ALSO drains the queue after a request, running the very same pipeline. Those writes have no
 * single `app.org_id` to bind, so against a real (RLS-enforcing) Postgres they were failing
 * with "new row violates row-level security policy". This returns the system-mode handle that
 * path needs.
 *
 * `fallback` is the caller's current handle, returned unchanged in every case that does not
 * need a distinct system pool:
 * - Global system process (the worker): its connections already carry `app.system=on`.
 * - PGlite (zero-dependency dev, and the in-memory `createTestDb()` handle in tests): it runs
 *   as the bootstrap superuser, which bypasses RLS entirely, so no separate context is needed —
 *   and a second PGlite instance over the same data is unsupported (see the singleton note).
 * Only the remaining case — a real, RLS-enforcing Postgres in a tenant web process — gets a
 * dedicated pool whose connections set `app.system=on`, and it is created lazily so the pool
 * exists only when inline draining actually runs.
 */
export function getSystemDb(fallback: AppDb): Promise<AppDb> {
  if (dbGlobal.__buildflowDbSystem || !process.env.DATABASE_URL) return Promise.resolve(fallback);
  if (!dbGlobal.__buildflowSystemDb) dbGlobal.__buildflowSystemDb = createSystemPool();
  return dbGlobal.__buildflowSystemDb;
}

async function createSystemPool(): Promise<AppDb> {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });
  pool.on("connect", (client) => {
    void client.query("select set_config('app.system', 'on', false)");
  });
  // No migration here: getDb() already migrated the primary pool against the same database.
  return drizzlePg(pool, { schema }) as unknown as AppDb;
}

export async function createTestDb(): Promise<AppDb> {
  const { PGlite, nodePgliteVector, drizzlePglite, migratePglite } = await loadPglite();
  const pglite = new PGlite({ extensions: { vector: nodePgliteVector } }); // in-memory
  const db = drizzlePglite(pglite, { schema });
  await migratePglite(db, { migrationsFolder: migrationsDir() });
  return db as unknown as AppDb;
}
