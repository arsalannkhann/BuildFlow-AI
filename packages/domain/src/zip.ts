export type ZipEntry = { name: string; bytes: Uint8Array };

const encoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function safeName(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    throw new Error(`Unsafe ZIP entry name: ${value}`);
  }
  return parts.join("/");
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}

/** Deterministic, dependency-free ZIP (store method; no compression). */
export function createZip(entries: ZipEntry[]): Uint8Array {
  if (!entries.length) throw new Error("A ZIP needs at least one entry");
  const seen = new Set<string>();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = safeName(entry.name);
    if (seen.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
    seen.add(name);
    const nameBytes = encoder.encode(name);
    const checksum = crc32(entry.bytes);
    const local = new Uint8Array(30 + nameBytes.byteLength);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, entry.bytes.byteLength, true);
    lv.setUint32(22, entry.bytes.byteLength, true);
    lv.setUint16(26, nameBytes.byteLength, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.byteLength);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, entry.bytes.byteLength, true);
    cv.setUint32(24, entry.bytes.byteLength, true);
    cv.setUint16(28, nameBytes.byteLength, true);
    cv.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);

    locals.push(local, entry.bytes);
    centrals.push(central);
    localOffset += local.byteLength + entry.bytes.byteLength;
  }

  const centralBytes = concat(centrals);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralBytes.byteLength, true);
  ev.setUint32(16, localOffset, true);
  return concat([...locals, centralBytes, end]);
}
