import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { schema } from "./schema";

export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

let cached: AppDb | null = null;

export async function createDb(dataDir?: string): Promise<AppDb> {
  const pg = new PGlite(dataDir ?? process.env.PGLITE_DATA_DIR ?? ".pglite");
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

export async function getDb(): Promise<AppDb> {
  if (!cached) cached = await createDb();
  return cached;
}

export async function createTestDb(): Promise<AppDb> {
  const pg = new PGlite(); // in-memory
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}
