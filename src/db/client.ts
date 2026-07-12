import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { schema } from "./schema";

export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

export async function createDb(dataDir?: string): Promise<AppDb> {
  const pg = new PGlite(dataDir ?? process.env.PGLITE_DATA_DIR ?? ".pglite");
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
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
  const pg = new PGlite(); // in-memory
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}
