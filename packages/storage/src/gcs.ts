import { createHash } from "node:crypto";
import { Storage, type Bucket } from "@google-cloud/storage";
import type { SignedStorageUrl, StoragePort } from "./port";

function assertKey(key: string): void {
  if (!key.trim() || key.startsWith("/") || key.includes("\\") || key.split("/").includes("..")) {
    throw new Error("Invalid storage key");
  }
}

/**
 * Private Google Cloud Storage adapter. Runtime authentication uses Application Default
 * Credentials locally and the Cloud Run service account in production; no service-account
 * key file is required or supported by the application configuration.
 */
export class GcsStorage implements StoragePort {
  private readonly bucket: Bucket;

  constructor(bucketName: string, client: Storage = new Storage()) {
    if (!bucketName.trim()) throw new Error("GCS storage bucket is required");
    this.bucket = client.bucket(bucketName);
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    assertKey(key);
    await this.bucket.file(key).save(Buffer.from(bytes), {
      contentType,
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    return {
      checksum: createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.byteLength,
    };
  }

  async get(key: string): Promise<Uint8Array> {
    assertKey(key);
    const [bytes] = await this.bucket.file(key).download();
    return new Uint8Array(bytes);
  }

  async exists(key: string): Promise<boolean> {
    assertKey(key);
    const [exists] = await this.bucket.file(key).exists();
    return exists;
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await this.bucket.file(key).delete({ ignoreNotFound: true });
  }

  async list(prefix: string): Promise<string[]> {
    if (prefix) assertKey(prefix);
    const [files] = await this.bucket.getFiles({ prefix, autoPaginate: true });
    return files.map((file) => file.name).sort();
  }

  async createSignedGetUrl(key: string, expiresInSeconds: number): Promise<SignedStorageUrl> {
    assertKey(key);
    const ttl = Math.min(Math.max(Math.floor(expiresInSeconds), 30), 3_600);
    const expiresAt = new Date(Date.now() + ttl * 1_000);
    const [url] = await this.bucket.file(key).getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });
    return { url, expiresAt };
  }

  async createSignedUploadUrl(key: string): Promise<SignedStorageUrl> {
    assertKey(key);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);
    const [url] = await this.bucket.file(key).getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
    });
    return { url, expiresAt };
  }
}
