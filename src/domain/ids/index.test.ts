import { expect, test } from "vitest";
import { newId } from "./index";

test("newId returns a 36-char UUID string", () => {
  const id = newId();
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("newId is monotonic-ish (sorts by creation order)", () => {
  const a = newId();
  const b = newId();
  expect([a, b].sort()).toEqual([a, b]);
});
