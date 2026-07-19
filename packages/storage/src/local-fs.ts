import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access, readdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { StoragePort } from "./port";
import { workspaceRoot } from "./workspace-root";

const defaultRoot = () => {
  const configured = process.env.STORAGE_DIR ?? "local-storage";
  return isAbsolute(configured) ? configured : join(workspaceRoot(), configured);
};

export class LocalFsStorage implements StoragePort {
  private readonly resolvedRoot: string;

  constructor(root: string = defaultRoot()) {
    this.resolvedRoot = resolve(root);
  }

  private path(key: string) {
    if (!key.trim() || key.includes("\\") || isAbsolute(key)) throw new Error("Invalid storage key");
    const candidate = resolve(this.resolvedRoot, key);
    if (candidate !== this.resolvedRoot && !candidate.startsWith(`${this.resolvedRoot}${sep}`)) {
      throw new Error("Storage key escapes configured root");
    }
    return candidate;
  }

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

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async list(prefix: string): Promise<string[]> {
    const start = this.path(prefix || ".");
    const found: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile()) found.push(relative(this.resolvedRoot, path).split(sep).join("/"));
      }
    };
    await walk(start);
    return found.sort();
  }
}
