import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@buildflow/db/client";
import { resolveTenantContext } from "@buildflow/auth/context";
import { registerOrganizationOwner } from "./registration-core";

test("organization registration atomically provisions the owner and audit boundary", async () => {
  const db = await createTestDb();
  const result = await registerOrganizationOwner(db, {
    organizationName: "  Northstar Infra Pvt Ltd ", ownerName: "  Asha Verma ",
    email: "ASHA@EXAMPLE.COM", password: "strong-demo-password",
  });
  const ctx = await resolveTenantContext(db, result.userId);
  expect(ctx.organizationId).toBe(result.organizationId);
  expect(ctx.capabilities).toContain("org.manage");
  const event = await db.execute(sql`select action, metadata from audit_event where organization_id = ${result.organizationId}`);
  expect((event as unknown as { rows: { action: string; metadata: unknown }[] }).rows).toEqual([{
    action: "organization.created", metadata: { source: "self_service_registration" },
  }]);
  await expect(registerOrganizationOwner(db, {
    organizationName: "Other Org", ownerName: "Other Owner",
    email: "asha@example.com", password: "another-demo-password",
  })).rejects.toThrow(/registration_conflict|unique|duplicate/i);
});
