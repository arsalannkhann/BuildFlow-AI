import { expect, test } from "vitest";
import { addDecimal, cmpDecimal, isDecimalString, mulDecimal, normalizeDecimal } from "./decimal";

test("decimal arithmetic is exact (no binary float artifacts)", () => {
  expect(addDecimal("0.1", "0.2")).toBe("0.3");
  expect(addDecimal("2.5", "-2.5")).toBe("0");
  expect(mulDecimal("2.5", "4")).toBe("10");
  expect(mulDecimal("2.5", "0.15")).toBe("0.375");
  expect(mulDecimal("-1.5", "2")).toBe("-3");
});

test("comparison and normalization", () => {
  expect(cmpDecimal("50", "100")).toBe(-1);
  expect(cmpDecimal("100.0", "100")).toBe(0);
  expect(cmpDecimal("3.5", "3.49")).toBe(1);
  expect(normalizeDecimal("02.50")).toBe("2.5");
  expect(normalizeDecimal("18.000")).toBe("18");
  expect(isDecimalString("3.5")).toBe(true);
  expect(isDecimalString("3,5")).toBe(false);
  expect(() => normalizeDecimal("abc")).toThrow(/decimal/i);
});
