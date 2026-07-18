import { expect, test } from "vitest";
import { can, assertCan, assertSameOrg, type TenantContext } from "./tenancy";

const engineer: TenantContext = { organizationId: "org-a", projectId: "proj-1",
  userId: "u1", capabilities: ["report.create", "report.review"] };
const manager: TenantContext = { organizationId: "org-a", projectId: "proj-1",
  userId: "u2", capabilities: ["report.review", "report.approve", "report.issue"] };

test("capability checks", () => {
  expect(can(engineer, "report.create")).toBe(true);
  expect(can(engineer, "report.approve")).toBe(false);
  expect(can(manager, "report.issue")).toBe(true);
  expect(() => assertCan(engineer, "report.approve")).toThrow(/not permitted/i);
});

test("assertSameOrg fails closed on cross-tenant rows", () => {
  expect(() => assertSameOrg(engineer, { organization_id: "org-a" })).not.toThrow();
  expect(() => assertSameOrg(engineer, { organization_id: "org-b" })).toThrow(/cross-tenant/i);
});
