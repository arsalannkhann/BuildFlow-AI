import { expect, test } from "vitest";
import { computeMbQuantity, quantityMatches } from "./calc";

test("quantity is the exact product of the provided dimensions", () => {
  expect(computeMbQuantity({ length: "2.5", breadth: "4", depth: "0.15" }))
    .toEqual({ quantity: "1.5", formula: "L×B×D" });
  expect(computeMbQuantity({ length: "2.5", breadth: "4", depth: "0.15", count: 2 }))
    .toEqual({ quantity: "3", formula: "L×B×D×n" });
  expect(computeMbQuantity({ length: "12.35", breadth: "0.23" }))
    .toEqual({ quantity: "2.8405", formula: "L×B" });
  expect(computeMbQuantity({ length: "7.5" })).toEqual({ quantity: "7.5", formula: "L" });
  expect(computeMbQuantity({ count: 12 })).toEqual({ quantity: "12", formula: "n" });
  // No binary-float artifacts: 0.1 × 0.2 is exactly 0.02.
  expect(computeMbQuantity({ length: "0.1", breadth: "0.2" }).quantity).toBe("0.02");
});

test("invalid dimensions are refused", () => {
  expect(() => computeMbQuantity({})).toThrow(/at least one/i);
  expect(() => computeMbQuantity({ length: "abc" })).toThrow(/decimal/i);
  expect(() => computeMbQuantity({ length: "-2" })).toThrow(/positive/i);
  expect(() => computeMbQuantity({ count: 0 })).toThrow(/positive whole/i);
  expect(() => computeMbQuantity({ count: 2.5 })).toThrow(/positive whole/i);
});

test("quantityMatches compares numerically, not textually", () => {
  const dims = { length: "2.5", breadth: "4", depth: "0.15" };
  expect(quantityMatches(dims, "1.5")).toBe(true);
  expect(quantityMatches(dims, "1.50")).toBe(true); // same number, different text
  expect(quantityMatches(dims, "1.51")).toBe(false);
  expect(quantityMatches(dims, "garbage")).toBe(false);
});
