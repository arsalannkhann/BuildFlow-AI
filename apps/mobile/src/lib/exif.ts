// EXIF helpers for photo attachments. Pure TypeScript.
// Photo metadata may be absent or manipulated; it is presented as metadata,
// not guaranteed truth (rules.md §13).

/** EXIF fields surfaced by expo-image-picker assets that we care about. */
export interface ExifLike {
  DateTimeOriginal?: unknown;
  DateTime?: unknown;
  GPSLatitude?: unknown;
  GPSLongitude?: unknown;
}

/**
 * Converts an EXIF timestamp ("YYYY:MM:DD HH:MM:SS", local time of the device
 * that captured it) into ISO 8601 with the current device's UTC offset.
 * Returns undefined when the field is missing or malformed.
 */
export function exifTimestampToIso(exif: ExifLike | null | undefined, now: Date): string | undefined {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTime;
  if (typeof raw !== "string") return undefined;
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

export function exifHasLocation(exif: ExifLike | null | undefined): boolean {
  return typeof exif?.GPSLatitude === "number" && typeof exif?.GPSLongitude === "number";
}

/** Current device time as ISO 8601 with the local UTC offset. */
export function isoNowWithOffset(now: Date): string {
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}
