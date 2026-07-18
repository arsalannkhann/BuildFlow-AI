// CI gate (ADR-0002): the shared migration set must apply cleanly to real PostgreSQL and
// leave RLS active. Run with DATABASE_URL pointing at a disposable database.
import { sql } from "drizzle-orm";
import { createDb } from "../src/client";
import { seed } from "../src/seed";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = await createDb(); // applies migrations
await seed(db);

const rls = await db.execute(sql`
  select relname from pg_class
  where relrowsecurity and relforcerowsecurity
    and relname in ('daily_report', 'organization', 'attachment')`);
const rows = (rls as unknown as { rows: { relname: string }[] }).rows;
if (rows.length !== 3) {
  console.error("RLS not active on expected tables:", rows);
  process.exit(1);
}
console.log("real-postgres verification OK: migrations + seed + RLS active");
process.exit(0);
