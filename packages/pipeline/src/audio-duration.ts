/**
 * Audio duration probe (T3.2).
 *
 * HONESTY NOTE — what this is and is not:
 *   - It reads duration from CONTAINER METADATA (WebM/Matroska, MP4/M4A, WAV, Ogg). It does
 *     not decode audio and pulls in no ffmpeg/native dependency.
 *   - The client manifest is NOT the source. `CreateReportRequest` carries no duration field
 *     today, and adding one would mean editing `packages/contracts` and the attachment
 *     upsert, both outside this change. Server-side probing is also the more trustworthy
 *     option: a client-declared duration is an unverified claim about evidence.
 *   - It returns null whenever the container does not say. Never a guess, never an estimate
 *     from the transcript — model-generated segment timestamps are not measurements
 *     (memory.md §14), so using them here would fabricate a measurement.
 *
 * The number feeds a WARNING, never a rejection, so a lower-bound answer (see
 * `cluster_timecode` below) is acceptable and is labelled as such.
 */

export type DurationProbe = {
  durationMs: number;
  /** How the number was obtained — recorded so a surprising value can be explained. */
  source: "ebml_duration" | "ebml_cluster_timecode" | "mp4_mvhd" | "wav_data_chunk" | "ogg_granule";
  /** True when the container only gave a floor (real duration is >= durationMs). */
  approximate: boolean;
};

const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

const view = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// ---------------------------------------------------------------------------------------
// EBML / Matroska / WebM
// ---------------------------------------------------------------------------------------

const EBML_HEADER = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;
const CLUSTER = 0x1f43b675;
const CLUSTER_TIMECODE = 0xe7;

type Vint = { value: number; length: number; unknown: boolean };

/** EBML variable-size integer. `keepMarker` keeps the leading bits (element IDs need them). */
function readVint(bytes: Uint8Array, offset: number, keepMarker: boolean): Vint | null {
  if (offset >= bytes.length) return null;
  const first = bytes[offset];
  if (first === 0) return null; // 5+ byte lengths are legal but never appear in practice
  let length = 1;
  for (let mask = 0x80; mask > 0 && (first & mask) === 0; mask >>= 1) length += 1;
  if (length > 8 || offset + length > bytes.length) return null;

  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = (first & (0xff >> length)) === (0xff >> length);
  for (let index = 1; index < length; index += 1) {
    const byte = bytes[offset + index];
    // Values beyond 2^53 cannot occur for sizes we care about; plain arithmetic is safe.
    value = value * 256 + byte;
    if (byte !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function readUnsigned(bytes: Uint8Array, offset: number, size: number): number {
  let value = 0;
  for (let index = 0; index < size; index += 1) value = value * 256 + bytes[offset + index];
  return value;
}

function readFloat(bytes: Uint8Array, offset: number, size: number): number | null {
  const data = view(bytes);
  if (size === 4) return data.getFloat32(offset);
  if (size === 8) return data.getFloat64(offset);
  return null;
}

function probeMatroska(bytes: Uint8Array): DurationProbe | null {
  if (bytes.length < 4 || readUnsigned(bytes, 0, 4) !== EBML_HEADER) return null;

  // Walk top level to the Segment element.
  let cursor = 0;
  let segmentStart = -1;
  let segmentEnd = bytes.length;
  while (cursor < bytes.length) {
    const id = readVint(bytes, cursor, true);
    if (!id) break;
    const size = readVint(bytes, cursor + id.length, false);
    if (!size) break;
    const dataStart = cursor + id.length + size.length;
    if (id.value === SEGMENT) {
      segmentStart = dataStart;
      segmentEnd = size.unknown ? bytes.length : Math.min(bytes.length, dataStart + size.value);
      break;
    }
    cursor = size.unknown ? dataStart : dataStart + size.value;
  }
  if (segmentStart < 0) return null;

  let timecodeScaleNs = 1_000_000; // Matroska default: 1 ms
  let duration: number | null = null;
  let maxClusterTimecode: number | null = null;

  let position = segmentStart;
  let guard = 0;
  while (position < segmentEnd && guard < 100_000) {
    guard += 1;
    const id = readVint(bytes, position, true);
    if (!id) break;
    const size = readVint(bytes, position + id.length, false);
    if (!size) break;
    const dataStart = position + id.length + size.length;
    const dataEnd = size.unknown ? segmentEnd : Math.min(segmentEnd, dataStart + size.value);

    if (id.value === INFO) {
      let inner = dataStart;
      while (inner < dataEnd) {
        const innerId = readVint(bytes, inner, true);
        if (!innerId) break;
        const innerSize = readVint(bytes, inner + innerId.length, false);
        if (!innerSize) break;
        const innerData = inner + innerId.length + innerSize.length;
        if (innerId.value === TIMECODE_SCALE) {
          timecodeScaleNs = readUnsigned(bytes, innerData, innerSize.value) || timecodeScaleNs;
        } else if (innerId.value === DURATION) {
          duration = readFloat(bytes, innerData, innerSize.value);
        }
        inner = innerData + innerSize.value;
      }
    } else if (id.value === CLUSTER) {
      // Fallback for recordings written without a Duration (the common MediaRecorder case).
      let inner = dataStart;
      const innerLimit = Math.min(dataEnd, dataStart + 64); // Timecode is the first child
      while (inner < innerLimit) {
        const innerId = readVint(bytes, inner, true);
        if (!innerId) break;
        const innerSize = readVint(bytes, inner + innerId.length, false);
        if (!innerSize) break;
        const innerData = inner + innerId.length + innerSize.length;
        if (innerId.value === CLUSTER_TIMECODE) {
          const timecode = readUnsigned(bytes, innerData, innerSize.value);
          maxClusterTimecode = Math.max(maxClusterTimecode ?? 0, timecode);
          break;
        }
        inner = innerData + innerSize.value;
      }
    }

    position = dataEnd;
    if (dataEnd <= dataStart) break; // malformed; stop rather than spin
  }

  const msPerTick = timecodeScaleNs / 1_000_000;
  if (duration !== null && Number.isFinite(duration) && duration > 0) {
    return { durationMs: Math.round(duration * msPerTick), source: "ebml_duration", approximate: false };
  }
  if (maxClusterTimecode !== null && maxClusterTimecode > 0) {
    // Lower bound: the final cluster's own contents are not counted.
    return {
      durationMs: Math.round(maxClusterTimecode * msPerTick),
      source: "ebml_cluster_timecode",
      approximate: true,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------------------
// MP4 / M4A
// ---------------------------------------------------------------------------------------

function probeMp4(bytes: Uint8Array): DurationProbe | null {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== "ftyp") return null;
  const data = view(bytes);

  const findBox = (start: number, end: number, name: string): { start: number; end: number } | null => {
    let cursor = start;
    while (cursor + 8 <= end) {
      const size = data.getUint32(cursor);
      const type = ascii(bytes, cursor + 4, 4);
      const boxEnd = size === 0 ? end : cursor + size;
      if (size < 8 || boxEnd > end) return null;
      if (type === name) return { start: cursor + 8, end: boxEnd };
      cursor = boxEnd;
    }
    return null;
  };

  const moov = findBox(0, bytes.length, "moov");
  if (!moov) return null;
  const mvhd = findBox(moov.start, moov.end, "mvhd");
  if (!mvhd) return null;

  const version = bytes[mvhd.start];
  let timescale: number;
  let duration: number;
  if (version === 1) {
    timescale = data.getUint32(mvhd.start + 20);
    duration = Number(data.getBigUint64(mvhd.start + 24));
  } else {
    timescale = data.getUint32(mvhd.start + 12);
    duration = data.getUint32(mvhd.start + 16);
  }
  if (!timescale || !Number.isFinite(duration) || duration <= 0) return null;
  return { durationMs: Math.round((duration / timescale) * 1000), source: "mp4_mvhd", approximate: false };
}

// ---------------------------------------------------------------------------------------
// WAV
// ---------------------------------------------------------------------------------------

function probeWav(bytes: Uint8Array): DurationProbe | null {
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return null;
  const data = view(bytes);
  let cursor = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (cursor + 8 <= bytes.length) {
    const type = ascii(bytes, cursor, 4);
    const size = data.getUint32(cursor + 4, true);
    if (type === "fmt ") byteRate = data.getUint32(cursor + 12, true);
    if (type === "data") dataSize = Math.min(size, bytes.length - cursor - 8);
    cursor += 8 + size + (size % 2); // chunks are word aligned
  }
  if (!byteRate || !dataSize) return null;
  return { durationMs: Math.round((dataSize / byteRate) * 1000), source: "wav_data_chunk", approximate: false };
}

// ---------------------------------------------------------------------------------------
// Ogg (Opus/Vorbis)
// ---------------------------------------------------------------------------------------

function probeOgg(bytes: Uint8Array): DurationProbe | null {
  if (bytes.length < 27 || ascii(bytes, 0, 4) !== "OggS") return null;
  // Scan backwards for the last page header; its granule position is the stream length.
  for (let offset = bytes.length - 27; offset >= 0; offset -= 1) {
    if (ascii(bytes, offset, 4) !== "OggS") continue;
    const granule = Number(view(bytes).getBigUint64(offset + 6, true));
    if (!Number.isFinite(granule) || granule <= 0) return null;
    // Opus granules always count 48 kHz samples. Pre-skip (~6.5 ms) is ignored — far below
    // anything this signal is used to decide.
    return { durationMs: Math.round((granule / 48_000) * 1000), source: "ogg_granule", approximate: true };
  }
  return null;
}

/**
 * Best-effort container probe. Returns null when the bytes are not a container we can read
 * or the container simply does not carry a duration.
 */
export function probeAudioDuration(bytes: Uint8Array): DurationProbe | null {
  try {
    return probeMatroska(bytes) ?? probeMp4(bytes) ?? probeWav(bytes) ?? probeOgg(bytes);
  } catch {
    // A corrupt or truncated upload must never fail report processing over a warning signal.
    return null;
  }
}

export function probeAudioDurationMs(bytes: Uint8Array): number | null {
  return probeAudioDuration(bytes)?.durationMs ?? null;
}
