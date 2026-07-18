import { getDb } from "./client";
import { seed } from "./seed";

let booted = false;
export async function ensureBooted(): Promise<void> {
  if (booted) return;
  await seed(await getDb());
  booted = true;
}
