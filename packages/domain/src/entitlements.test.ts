import { expect, test } from "vitest";
import { entitlementDecision, PLAN_LIMITS } from "./entitlements";

const usage = { projects: 2, users: 4, storageBytes: 0, aiRunsThisMonth: 0 };

test("starter limits are centralized and return actionable upgrade copy", () => {
  const decision = entitlementDecision("starter", "active", usage, "projects");
  expect(decision.allowed).toBe(false);
  expect(decision.message).toMatch(/upgrade/i);
  expect(PLAN_LIMITS.enterprise.projects).toBeNull();
});

test("paused billing blocks expansion without deleting or hiding existing data", () => {
  expect(entitlementDecision("professional", "paused", usage, "users").allowed).toBe(false);
  expect(entitlementDecision("professional", "past_due", usage, "users").allowed).toBe(true);
});
