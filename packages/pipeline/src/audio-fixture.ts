/**
 * Synthetic WebM/Matroska builder for tests and local checks.
 *
 * Real recordings cannot be committed (rules.md §14 — no customer content in fixtures) and a
 * hand-typed byte array is unreadable, so the container is assembled here from the same
 * structure the probe walks: EBML header, Segment, Info, TimecodeScale, Duration.
 * It contains NO audio data — only the metadata the duration probe reads.
 */

const EBML_HEADER_ID = [0x1a, 0x45, 0xdf, 0xa3];
const SEGMENT_ID = [0x18, 0x53, 0x80, 0x67];
const INFO_ID = [0x15, 0x49, 0xa9, 0x66];
const TIMECODE_SCALE_ID = [0x2a, 0xd7, 0xb1];
const DURATION_ID = [0x44, 0x89];

/** EBML data size as a variable-length integer (1–4 bytes is plenty here). */
function sizeVint(length: number): number[] {
  if (length < 0x7f) return [0x80 | length];
  if (length < 0x3fff) return [0x40 | (length >> 8), length & 0xff];
  return [0x20 | (length >> 16), (length >> 8) & 0xff, length & 0xff];
}

function element(id: number[], payload: number[]): number[] {
  return [...id, ...sizeVint(payload.length), ...payload];
}

function float32(value: number): number[] {
  const buffer = new DataView(new ArrayBuffer(4));
  buffer.setFloat32(0, value);
  return [0, 1, 2, 3].map((index) => buffer.getUint8(index));
}

/** A WebM container that declares `durationMs` and holds no audio. */
export function synthesizeWebm(durationMs: number): Uint8Array {
  const timecodeScaleNs = 1_000_000; // 1 ms per tick — the Matroska default
  const info = element(INFO_ID, [
    ...element(TIMECODE_SCALE_ID, [
      (timecodeScaleNs >> 16) & 0xff, (timecodeScaleNs >> 8) & 0xff, timecodeScaleNs & 0xff,
    ]),
    ...element(DURATION_ID, float32(durationMs)),
  ]);
  return new Uint8Array([
    ...element(EBML_HEADER_ID, []),
    ...element(SEGMENT_ID, info),
  ]);
}
