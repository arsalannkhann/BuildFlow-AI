import { expect, test } from "vitest";
import { contextForUser } from "./session";
import { SEED } from "@buildflow/db/seed";

test("builds a TenantContext for a seeded user", () => {
  const ctx = contextForUser(SEED.manager.id);
  expect(ctx.userId).toBe(SEED.manager.id);
  expect(ctx.organizationId).toBe(SEED.orgId);
  expect(ctx.capabilities).toContain("report.approve");
});

test("unknown user throws", () => {
  expect(() => contextForUser("nobody")).toThrow(/unknown user/i);
});
