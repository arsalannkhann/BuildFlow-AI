import { expect, test } from "vitest";
import { canTransition, assertTransition, REPORT_STATUSES } from "./state";

test("legal transitions", () => {
  expect(canTransition("UPLOADED", "PROCESSING")).toBe(true);
  expect(canTransition("PROCESSING", "AWAITING_REVIEW")).toBe(true);
  expect(canTransition("PROCESSING", "PROCESSING_FAILED")).toBe(true);
  expect(canTransition("PROCESSING_FAILED", "PROCESSING")).toBe(true);
  expect(canTransition("PROCESSING_FAILED", "AWAITING_REVIEW")).toBe(true);
  expect(canTransition("AWAITING_REVIEW", "APPROVED")).toBe(true);
  expect(canTransition("AWAITING_REVIEW", "REJECTED")).toBe(true);
  expect(canTransition("REJECTED", "AWAITING_REVIEW")).toBe(true);
  expect(canTransition("APPROVED", "ISSUED")).toBe(true);
  expect(canTransition("ISSUED", "SUPERSEDED")).toBe(true);
});

test("illegal transitions are rejected", () => {
  expect(canTransition("UPLOADED", "APPROVED")).toBe(false);
  expect(canTransition("ISSUED", "AWAITING_REVIEW")).toBe(false);
  expect(canTransition("APPROVED", "PROCESSING")).toBe(false);
  expect(() => assertTransition("ISSUED", "APPROVED")).toThrow(/illegal transition/i);
});

test("all statuses are enumerated", () => {
  expect(REPORT_STATUSES).toContain("ISSUED");
  expect(REPORT_STATUSES.length).toBe(8);
});
