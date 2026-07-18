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

test("every role resolves to a non-empty, known capability set", async () => {
  const { ROLES, ROLE_CAPABILITIES, CAPABILITIES, capabilitiesForRole } = await import("./tenancy");
  for (const role of ROLES) {
    const caps = ROLE_CAPABILITIES[role];
    expect(caps.length).toBeGreaterThan(0);
    for (const cap of caps) expect(CAPABILITIES).toContain(cap);
  }
  // client viewers can only read issued client-safe reports; auditors cannot mutate
  expect(ROLE_CAPABILITIES.client_viewer).toEqual(["client.reports.read"]);
  expect(ROLE_CAPABILITIES.auditor.some((c) => c.endsWith(".manage"))).toBe(false);
  // bundles are defensive copies
  const copy = capabilitiesForRole("site_engineer");
  copy.push("org.manage");
  expect(ROLE_CAPABILITIES.site_engineer).not.toContain("org.manage");
});
