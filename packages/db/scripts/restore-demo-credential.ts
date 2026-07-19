// Dev utility: restore the seeded demo password after local reset-flow testing.
import { eq } from "drizzle-orm";
import { createDb } from "../src/client";
import { authCredentials } from "../src/schema";
import { seed, SEED } from "../src/seed";

const db = await createDb();
await db.delete(authCredentials).where(eq(authCredentials.userId, SEED.engineer.id));
await seed(db);
console.log("demo credential restored for", SEED.engineer.email);
process.exit(0);
