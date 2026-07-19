import { expect, test } from "vitest";
import { computeEac } from "./eac";

test("EAC takes the larger of remaining budget and committed-not-invoiced", () => {
  // Remaining budget dominates.
  const a = computeEac({ actualToDatePaise: 50_00_000, remainingBudgetPaise: 30_00_000, committedNotInvoicedPaise: 10_00_000 });
  expect(a.eacPaise).toBe(80_00_000);
  // Committed dominates (orders already placed beyond remaining budget).
  const b = computeEac({ actualToDatePaise: 50_00_000, remainingBudgetPaise: 5_00_000, committedNotInvoicedPaise: 25_00_000 });
  expect(b.eacPaise).toBe(75_00_000);
});

test("every EAC figure carries its formula string in INR", () => {
  const { formula } = computeEac({
    actualToDatePaise: 123456789, remainingBudgetPaise: 100, committedNotInvoicedPaise: 0,
  });
  expect(formula).toBe(
    "EAC = actual to date ₹12,34,567.89 + max(remaining budget ₹1.00, committed not invoiced ₹0.00) = ₹12,34,568.89",
  );
});

test("rejects non-integer or negative inputs", () => {
  expect(() => computeEac({ actualToDatePaise: 1.5, remainingBudgetPaise: 0, committedNotInvoicedPaise: 0 })).toThrow();
  expect(() => computeEac({ actualToDatePaise: 0, remainingBudgetPaise: -1, committedNotInvoicedPaise: 0 })).toThrow();
});
