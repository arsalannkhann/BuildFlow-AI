import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SignedStorageUrl, StoragePort } from "./port";

function assertKey(key: string): void {
  if (!key.trim() || key.startsWith("/") || key.includes("\\") || key.split("/").includes("..")) {
    throw new Error("Invalid storage key");
  }
}

export class SupabaseStorage implements StoragePort {
  private readonly client: SupabaseClient;

  constructor(
    private readonly bucketName: string,
    url: string,
    serviceRoleKey: string,
    client?: SupabaseClient,
  ) {
    if (!bucketName || !url || !serviceRoleKey) throw new Error("Supabase storage configuration is incomplete");
    this.client = client ?? createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  private bucket() { return this.client.storage.from(this.bucketName); }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    assertKey(key);
    const { error } = await this.bucket().upload(key, bytes, { contentType, upsert: false });
    if (error) throw new Error(`Storage upload failed: ${error.name}`);
    return {
      checksum: createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.byteLength,
    };
  }

  async get(key: string): Promise<Uint8Array> {
    assertKey(key);
    const { data, error } = await this.bucket().download(key);
    if (error || !data) throw new Error(`Storage download failed: ${error?.name ?? "empty_response"}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  async exists(key: string): Promise<boolean> {
    assertKey(key);
    const slash = key.lastIndexOf("/");
    const prefix = slash < 0 ? "" : key.slice(0, slash);
    const name = slash < 0 ? key : key.slice(slash + 1);
    const { data, error } = await this.bucket().list(prefix, { search: name, limit: 100 });
    if (error) throw new Error(`Storage list failed: ${error.name}`);
    return (data ?? []).some((item) => item.name === name && Boolean(item.id));
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    const { error } = await this.bucket().remove([key]);
    if (error) throw new Error(`Storage delete failed: ${error.name}`);
  }

  async list(prefix: string): Promise<string[]> {
    if (prefix) assertKey(prefix);
    const results: string[] = [];
    const visit = async (folder: string): Promise<void> => {
      for (let offset = 0; ; offset += 1_000) {
        const { data, error } = await this.bucket().list(folder, {
          limit: 1_000, offset, sortBy: { column: "name", order: "asc" },
        });
        if (error) throw new Error(`Storage list failed: ${error.name}`);
        const page = data ?? [];
        for (const item of page) {
          const key = folder ? `${folder}/${item.name}` : item.name;
          if (item.id) results.push(key);
          else await visit(key);
        }
        if (page.length < 1_000) break;
      }
    };
    await visit(prefix);
    return results.sort();
  }

  async createSignedGetUrl(key: string, expiresInSeconds: number): Promise<SignedStorageUrl> {
    assertKey(key);
    const ttl = Math.min(Math.max(Math.floor(expiresInSeconds), 30), 3_600);
    const { data, error } = await this.bucket().createSignedUrl(key, ttl, { download: false });
    if (error || !data?.signedUrl) throw new Error(`Storage signing failed: ${error?.name ?? "empty_response"}`);
    return { url: data.signedUrl, expiresAt: new Date(Date.now() + ttl * 1_000) };
  }

  async createSignedUploadUrl(key: string): Promise<SignedStorageUrl> {
    assertKey(key);
    const { data, error } = await this.bucket().createSignedUploadUrl(key, { upsert: false });
    if (error || !data?.signedUrl) throw new Error(`Storage signing failed: ${error?.name ?? "empty_response"}`);
    return {
      url: data.signedUrl,
      token: data.token,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1_000),
    };
  }
}
