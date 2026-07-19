import { expect, test } from "vitest";
import { createZip } from "./zip";

test("creates a deterministic ZIP with named entries", () => {
  const input = [
    { name: "manifest.json", bytes: new TextEncoder().encode("{}") },
    { name: "evidence/photo.txt", bytes: new TextEncoder().encode("proof") },
  ];
  const first = createZip(input);
  const second = createZip(input);
  expect(first).toEqual(second);
  expect(new DataView(first.buffer).getUint32(0, true)).toBe(0x04034b50);
  expect(new TextDecoder().decode(first)).toContain("manifest.json");
  expect(new TextDecoder().decode(first)).toContain("evidence/photo.txt");
});

test("refuses traversal and duplicate entry names", () => {
  expect(() => createZip([{ name: "../secret", bytes: new Uint8Array() }])).toThrow(/Unsafe/);
  expect(() => createZip([
    { name: "same", bytes: new Uint8Array() }, { name: "same", bytes: new Uint8Array() },
  ])).toThrow(/Duplicate/);
});
