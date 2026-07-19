import { expect, test } from "vitest";
import { formatProjectDate, formatProjectDateTime, projectToday } from "./date-time";

test("date-only values stay on the intended project date", () => {
  expect(formatProjectDate("2026-07-19", { timeZone: "Asia/Kolkata" })).toBe("19 July 2026");
});

test("timestamps and today use the project timezone", () => {
  const instant = new Date("2026-07-19T20:00:00.000Z");
  expect(projectToday("Asia/Kolkata", instant)).toBe("2026-07-20");
  expect(formatProjectDateTime(instant, { timeZone: "Asia/Kolkata" })).toMatch(/20 July 2026.*1:30 am/i);
});
