import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsStorage } from "./local-fs";

test("put returns checksum + size and get round-trips; originals are immutable", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bf-store-"));
  const store = new LocalFsStorage(dir);
  const bytes = new TextEncoder().encode("hello");
  const meta = await store.put("audio/x.webm", bytes, "audio/webm");
  expect(meta.byteSize).toBe(5);
  expect(meta.checksum).toHaveLength(64);
  expect(new TextDecoder().decode(await store.get("audio/x.webm"))).toBe("hello");
  expect(await store.exists("audio/x.webm")).toBe(true);
  await expect(store.put("audio/x.webm", bytes, "audio/webm")).rejects.toThrow(/immutable|exists/i);
  expect(await store.list("audio")).toEqual(["audio/x.webm"]);
  await expect(store.put("../escape.txt", bytes, "text/plain")).rejects.toThrow(/escapes/i);
  await store.delete("audio/x.webm");
  expect(await store.exists("audio/x.webm")).toBe(false);
});
