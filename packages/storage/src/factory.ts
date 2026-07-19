import type { StoragePort } from "./port";
import { LocalFsStorage } from "./local-fs";
import { SupabaseStorage } from "./supabase";

export function getStorage(): StoragePort {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  // A service-role key may already be present for auth/database work while local storage is
  // still selected. Storage switches only when its URL or bucket is explicitly configured.
  if (url || bucket) {
    if (!url || !key || !bucket) {
      throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET must be set together");
    }
    return new SupabaseStorage(bucket, url, key);
  }
  return new LocalFsStorage();
}
