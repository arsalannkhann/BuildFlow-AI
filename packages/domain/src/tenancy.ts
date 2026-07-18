export const CAPABILITIES = [
  // organization administration
  "org.manage", "org.members.manage", "org.export", "org.audit.read",
  // project administration
  "project.manage", "project.members.manage", "project.read",
  // daily progress reports
  "report.create", "report.review", "report.approve", "report.issue", "report.read",
  // project controls (Phase C)
  "schedule.manage", "blocker.manage", "rfi.manage", "document.manage",
  // commercial operations (Phase D)
  "material.manage", "material.review", "procurement.manage", "procurement.approve",
  "labour.manage", "equipment.manage",
  "mb.create", "mb.verify", "mb.certify",
  "budget.manage", "budget.read", "invoice.review",
  // compliance (Phase E)
  "compliance.manage", "compliance.review",
  // read-only external audiences
  "client.reports.read",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const ROLES = [
  "org_owner", "project_admin", "project_manager", "site_engineer",
  "quantity_surveyor", "procurement_manager", "accountant", "client_viewer", "auditor",
] as const;
export type Role = (typeof ROLES)[number];

// Roles are presentation-level bundles; enforcement always checks capabilities
// (rules.md §13 / PRD §13). A user may hold different roles on different projects.
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  org_owner: [...CAPABILITIES],
  project_admin: [
    "project.manage", "project.members.manage", "project.read",
    "report.create", "report.review", "report.approve", "report.issue", "report.read",
    "schedule.manage", "blocker.manage", "rfi.manage", "document.manage",
    "material.manage", "material.review", "procurement.manage",
    "labour.manage", "equipment.manage",
    "mb.create", "mb.verify",
    "budget.manage", "budget.read", "invoice.review",
    "compliance.manage", "compliance.review",
  ],
  project_manager: [
    "project.read",
    "report.review", "report.approve", "report.issue", "report.read",
    "schedule.manage", "blocker.manage", "rfi.manage", "document.manage",
    "material.review", "labour.manage", "equipment.manage",
    "mb.verify", "budget.read", "invoice.review", "compliance.review",
  ],
  site_engineer: [
    "project.read", "report.create", "report.review", "report.read",
    "blocker.manage", "labour.manage", "equipment.manage", "material.manage", "mb.create",
  ],
  quantity_surveyor: [
    "project.read", "report.read", "mb.create", "mb.verify", "mb.certify", "budget.read",
  ],
  procurement_manager: [
    "project.read", "report.read",
    "material.manage", "material.review", "procurement.manage", "procurement.approve",
  ],
  accountant: [
    "project.read", "report.read", "budget.manage", "budget.read", "invoice.review",
  ],
  client_viewer: ["client.reports.read"],
  auditor: ["project.read", "report.read", "budget.read", "org.audit.read"],
};

export const capabilitiesForRole = (role: Role): Capability[] => [...ROLE_CAPABILITIES[role]];

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
