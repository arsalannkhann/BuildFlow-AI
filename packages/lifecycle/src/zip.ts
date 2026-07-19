const encoder = new TextEncoder();

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

export type ZipEntry = { name: string; bytes: Uint8Array };

/** Deterministic, dependency-free ZIP (stored entries, UTF-8 names, no ZIP64). */
export function createStoredZip(entries: ZipEntry[]): Uint8Array {
  if (entries.length > 65_535) throw new Error("ZIP entry limit exceeded");
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith("/") || entry.name.includes("..")) throw new Error("Unsafe ZIP entry name");
    if (entry.bytes.byteLength > 0xffffffff) throw new Error("ZIP64 is not supported");
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const localHeader = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc),
      u32(entry.bytes.byteLength), u32(entry.bytes.byteLength), u16(name.byteLength), u16(0), name,
    ]);
    local.push(localHeader, entry.bytes);
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc),
      u32(entry.bytes.byteLength), u32(entry.bytes.byteLength), u16(name.byteLength), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += localHeader.byteLength + entry.bytes.byteLength;
  }
  const centralBytes = concat(central);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralBytes.byteLength), u32(offset), u16(0),
  ]);
  return concat([...local, centralBytes, end]);
}
