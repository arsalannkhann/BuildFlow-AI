import { createDb } from "../src/client";
import { seedDemo } from "../src/demo-seed";

const db = await createDb();
await seedDemo(db);
process.stdout.write("Synthetic BuildFlow demo organization is ready.\n");
