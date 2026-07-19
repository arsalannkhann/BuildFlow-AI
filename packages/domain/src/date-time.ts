export type ProjectFormatOptions = {
  locale?: string;
  timeZone?: string;
};

function dateValue(value: Date | string): Date {
  if (value instanceof Date) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
}

export function formatProjectDate(
  value: Date | string,
  options: ProjectFormatOptions & Intl.DateTimeFormatOptions = {},
): string {
  const { locale = "en-IN", timeZone = "Asia/Kolkata", ...format } = options;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric", month: "long", year: "numeric", ...format, timeZone,
  }).format(dateValue(value));
}

export function formatProjectDateTime(
  value: Date | string,
  options: ProjectFormatOptions & Intl.DateTimeFormatOptions = {},
): string {
  return formatProjectDate(value, {
    hour: "numeric", minute: "2-digit", hour12: true, ...options,
  });
}

export function projectToday(timeZone = "Asia/Kolkata", now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
