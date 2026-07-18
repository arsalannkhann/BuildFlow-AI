export const CAPABILITIES = [
  "report.create", "report.review", "report.approve", "report.issue",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type TenantContext = {
  organizationId: string;
  projectId?: string;
  userId: string;
  capabilities: Capability[];
};

export const can = (ctx: TenantContext, cap: Capability): boolean =>
  ctx.capabilities.includes(cap);

export const assertCan = (ctx: TenantContext, cap: Capability): void => {
  if (!can(ctx, cap)) throw new Error(`Action not permitted: ${cap}`);
};

export const assertSameOrg = (ctx: TenantContext, row: { organization_id: string }): void => {
  if (row.organization_id !== ctx.organizationId) {
    throw new Error("Cross-tenant access denied");
  }
};
