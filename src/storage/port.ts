export interface StoragePort {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<{ checksum: string; byteSize: number }>;
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
}
