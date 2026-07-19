import { getDb } from "./client";
import { seed } from "./seed";

let booted = false;

export function shouldSeedDemo(nodeEnv = process.env.NODE_ENV, demoSeed = process.env.DEMO_SEED): boolean {
  return nodeEnv !== "production" || demoSeed === "1";
}

export async function ensureBooted(): Promise<void> {
  if (booted) return;
  const db = await getDb();
  // Synthetic accounts use a public repository password and must never be provisioned
  // implicitly in production. A production demo environment has to opt in deliberately.
  if (shouldSeedDemo()) {
    await seed(db);
  }
  booted = true;
}
