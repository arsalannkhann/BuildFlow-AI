import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { organizationExports, organizations, processingRuns, projects, users } from "@buildflow/db/schema";
import type { BillingStatus, Plan, UsageMeters } from "@buildflow/domain/entitlements";
import { parseBillingStatus, parsePlan } from "@buildflow/domain/entitlements";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type OrganizationSettings = {
  id: string;
  name: string;
  plan: Plan;
  billingStatus: BillingStatus;
  retentionDays: number | null;
  deletionRequestedAt: Date | null;
  deletionExecuteAfter: Date | null;
  deletionRequestedBy: string | null;
  deletionApprovedAt: Date | null;
  deletionApprovedBy: string | null;
};

export async function getOrganizationSettings(db: AppDb, organizationId: string): Promise<OrganizationSettings> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!row) throw new Error("Organization not found");
  return {
    id: row.id, name: row.name, plan: parsePlan(row.plan),
    billingStatus: parseBillingStatus(row.billingStatus), retentionDays: row.retentionDays,
    deletionRequestedAt: row.deletionRequestedAt, deletionExecuteAfter: row.deletionExecuteAfter,
    deletionRequestedBy: row.deletionRequestedBy, deletionApprovedAt: row.deletionApprovedAt,
    deletionApprovedBy: row.deletionApprovedBy,
  };
}

export async function organizationUsage(db: AppDb, organizationId: string, now = new Date()): Promise<UsageMeters> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [projectRows, userRows, runRows, storageResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.organizationId, organizationId)),
    db.select({ count: sql<number>`count(*)::int` }).from(users).where(and(eq(users.organizationId, organizationId), eq(users.isActive, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(processingRuns).where(and(
      eq(processingRuns.organizationId, organizationId), gte(processingRuns.startedAt, monthStart),
    )),
    db.execute(sql`
      select coalesce(sum(byte_size), 0)::text as bytes from (
        select byte_size from attachment where organization_id = ${organizationId}
        union all select byte_size from rfi_response where organization_id = ${organizationId} and byte_size is not null
        union all select byte_size from document_revision where organization_id = ${organizationId} and byte_size is not null
        union all select byte_size from material_receipt where organization_id = ${organizationId} and byte_size is not null
        union all select byte_size from invoice where organization_id = ${organizationId} and byte_size is not null
        union all select byte_size from mb_evidence where organization_id = ${organizationId}
        union all select byte_size from compliance_export where organization_id = ${organizationId}
        union all select byte_size from organization_export where organization_id = ${organizationId} and byte_size is not null
      ) storage_objects`),
  ]);
  const storageRows = (storageResult as unknown as { rows: { bytes: string }[] }).rows;
  return {
    projects: Number(projectRows[0]?.count ?? 0), users: Number(userRows[0]?.count ?? 0),
    aiRunsThisMonth: Number(runRows[0]?.count ?? 0), storageBytes: Number(storageRows[0]?.bytes ?? 0),
  };
}

export async function organizationCommercialOverview(db: AppDb, ctx: TenantContext) {
  const [organization, usage] = await Promise.all([
    getOrganizationSettings(db, ctx.organizationId), organizationUsage(db, ctx.organizationId),
  ]);
  return { organization, usage };
}

export async function updateOrganizationCommercialSettings(db: AppDb, ctx: TenantContext, input: {
  plan?: Plan; billingStatus?: BillingStatus; retentionDays?: number | null;
}): Promise<void> {
  await db.update(organizations).set(input).where(eq(organizations.id, ctx.organizationId));
}

export async function listOrganizationExports(db: AppDb, ctx: TenantContext, limit = 20) {
  return db.select().from(organizationExports)
    .where(eq(organizationExports.organizationId, ctx.organizationId))
    .orderBy(desc(organizationExports.createdAt)).limit(Math.min(limit, 100));
}

export async function getOrganizationExport(db: AppDb, ctx: TenantContext, exportId: string) {
  const [row] = await db.select().from(organizationExports).where(and(
    eq(organizationExports.id, exportId), eq(organizationExports.organizationId, ctx.organizationId),
  )).limit(1);
  return row ?? null;
}
