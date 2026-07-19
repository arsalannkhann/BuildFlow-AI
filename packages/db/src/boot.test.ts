import { expect, test } from "vitest";
import { shouldSeedDemo } from "./boot";

test("synthetic accounts fail closed in production unless explicitly enabled", () => {
  expect(shouldSeedDemo("production", undefined)).toBe(false);
  expect(shouldSeedDemo("production", "0")).toBe(false);
  expect(shouldSeedDemo("production", "1")).toBe(true);
  expect(shouldSeedDemo("development", undefined)).toBe(true);
  expect(shouldSeedDemo("test", undefined)).toBe(true);
});
