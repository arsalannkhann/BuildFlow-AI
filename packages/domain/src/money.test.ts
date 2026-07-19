import { expect, test } from "vitest";
import { formatINR, mulQuantityPaise, parseINRToPaise } from "./money";

test("formatINR uses Indian digit grouping", () => {
  expect(formatINR(123456789)).toBe("₹12,34,567.89"); // 12,34,567.89 rupees
  expect(formatINR(0)).toBe("₹0.00");
  expect(formatINR(100)).toBe("₹1.00");
  expect(formatINR(123400)).toBe("₹1,234.00");
  expect(formatINR(12345678900)).toBe("₹12,34,56,789.00");
  expect(formatINR(-250050)).toBe("-₹2,500.50");
  expect(() => formatINR(1.5)).toThrow(/integer paise/i);
});

test("parseINRToPaise accepts grouped and plain amounts", () => {
  expect(parseINRToPaise("12,34,567.89")).toBe(123456789);
  expect(parseINRToPaise("₹1,234")).toBe(123400);
  expect(parseINRToPaise("1234.5")).toBe(123450);
  expect(parseINRToPaise("-99.99")).toBe(-9999);
  expect(() => parseINRToPaise("12.345")).toThrow(/INR/i);
  expect(() => parseINRToPaise("abc")).toThrow(/INR/i);
});

test("mulQuantityPaise is exact scaled-integer math, half-up", () => {
  expect(mulQuantityPaise("2.5", 35000)).toBe(87500);
  expect(mulQuantityPaise("50", 38500)).toBe(1925000);
  expect(mulQuantityPaise("0.333", 10000)).toBe(3330);
  expect(mulQuantityPaise("1.005", 100)).toBe(101); // 100.5 rounds half-up
  expect(mulQuantityPaise("-2", 500)).toBe(-1000);
});
