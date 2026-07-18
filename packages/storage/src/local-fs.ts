import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { StoragePort } from "./port";
import { workspaceRoot } from "./workspace-root";

const defaultRoot = () => {
  const configured = process.env.STORAGE_DIR ?? "local-storage";
  return isAbsolute(configured) ? configured : join(workspaceRoot(), configured);
};

export class LocalFsStorage implements StoragePort {
  constructor(private readonly root: string = defaultRoot()) {}

  private path(key: string) { return join(this.root, key); }

  async put(key: string, bytes: Uint8Array, _contentType: string) {
    if (await this.exists(key)) throw new Error(`Object already exists (immutable): ${key}`);
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    return { checksum, byteSize: bytes.byteLength };
  }

  async get(key: string) { return new Uint8Array(await readFile(this.path(key))); }

  async exists(key: string) {
    try { await access(this.path(key)); return true; } catch { return false; }
  }
}
