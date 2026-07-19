export type SignedStorageUrl = {
  url: string;
  expiresAt: Date;
  token?: string;
};

export interface StoragePort {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<{ checksum: string; byteSize: number }>;
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  createSignedGetUrl?(key: string, expiresInSeconds: number): Promise<SignedStorageUrl>;
  createSignedUploadUrl?(key: string): Promise<SignedStorageUrl>;
}
