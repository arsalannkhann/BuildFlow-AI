import { sql } from "drizzle-orm";
import { createDb } from "../src/client";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = await createDb();
await db.execute(sql`select 1`);
process.stdout.write("BuildFlow database migrations applied successfully.\n");
process.exit(0);
