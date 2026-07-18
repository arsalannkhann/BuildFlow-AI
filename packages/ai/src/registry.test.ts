import { expect, test } from "vitest";
import { getAiRegistry } from "./registry";

test("defaults to mock provider with no env", () => {
  delete process.env.AI_PROVIDER;
  const reg = getAiRegistry();
  expect(reg.extraction.meta.provider).toBe("mock");
});
