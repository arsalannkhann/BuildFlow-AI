import type { StoragePort } from "./port";
import { LocalFsStorage } from "./local-fs";
import { SupabaseStorage } from "./supabase";
import { GcsStorage } from "./gcs";

export function getStorage(): StoragePort {
  const provider = process.env.STORAGE_PROVIDER;
  if (provider === "gcs") {
    const bucket = process.env.GCS_STORAGE_BUCKET;
    if (!bucket) throw new Error("GCS_STORAGE_BUCKET is required when STORAGE_PROVIDER=gcs");
    return new GcsStorage(bucket);
  }
  if (provider === "local") return new LocalFsStorage();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  // A service-role key may already be present for auth/database work while local storage is
  // still selected. Storage switches only when its URL or bucket is explicitly configured.
  if (provider === "supabase" || url || bucket) {
    if (!url || !key || !bucket) {
      throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET must be set together");
    }
    return new SupabaseStorage(bucket, url, key);
  }
  if (provider) {
    throw new Error(`Unknown STORAGE_PROVIDER: ${provider} (expected "local", "gcs", or "supabase")`);
  }
  return new LocalFsStorage();
}
