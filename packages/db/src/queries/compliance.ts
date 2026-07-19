import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import {
  complianceExports, compliancePacks, complianceRequirements,
} from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type CompliancePackRow = typeof compliancePacks.$inferSelect;
export type ComplianceRequirementRow = typeof complianceRequirements.$inferSelect;
export type ComplianceExportRow = typeof complianceExports.$inferSelect;

const org = (ctx: TenantContext) => ctx.organizationId;

export async function addCompliancePack(db: AppDb, ctx: TenantContext, input: {
  projectId: string; kind: string; title: string; periodStart: string; periodEnd: string;
  legalCaution: string;
}): Promise<CompliancePackRow> {
  const [row] = await db.insert(compliancePacks).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    kind: input.kind, title: input.title, periodStart: input.periodStart,
    periodEnd: input.periodEnd, legalCaution: input.legalCaution, createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function getCompliancePack(
  db: AppDb, ctx: TenantContext, id: string,
): Promise<CompliancePackRow | null> {
  const [row] = await db.select().from(compliancePacks).where(and(
    eq(compliancePacks.organizationId, org(ctx)), eq(compliancePacks.id, id),
  ));
  return row ?? null;
}

export async function listCompliancePacks(
  db: AppDb, ctx: TenantContext, projectId: string,
): Promise<CompliancePackRow[]> {
  return db.select().from(compliancePacks).where(and(
    eq(compliancePacks.organizationId, org(ctx)), eq(compliancePacks.projectId, projectId),
  )).orderBy(desc(compliancePacks.createdAt));
}

export async function updateCompliancePack(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  status: string; reviewedBy: string | null; reviewedAt: Date | null;
}>): Promise<void> {
  await db.update(compliancePacks).set({ ...patch, updatedAt: new Date() }).where(and(
    eq(compliancePacks.organizationId, org(ctx)), eq(compliancePacks.id, id),
  ));
}

export async function addComplianceRequirement(db: AppDb, ctx: TenantContext, input: {
  packId: string; requirementText: string; ownerName?: string | null; dueDate?: string | null;
  sortOrder?: number;
}): Promise<ComplianceRequirementRow> {
  const [row] = await db.insert(complianceRequirements).values({
    id: newId(), organizationId: org(ctx), packId: input.packId,
    requirementText: input.requirementText, ownerName: input.ownerName ?? null,
    dueDate: input.dueDate ?? null, sortOrder: input.sortOrder ?? 0,
  }).returning();
  return row;
}

export async function getComplianceRequirement(
  db: AppDb, ctx: TenantContext, id: string,
): Promise<ComplianceRequirementRow | null> {
  const [row] = await db.select().from(complianceRequirements).where(and(
    eq(complianceRequirements.organizationId, org(ctx)), eq(complianceRequirements.id, id),
  ));
  return row ?? null;
}

export async function listComplianceRequirements(
  db: AppDb, ctx: TenantContext, packId: string,
): Promise<ComplianceRequirementRow[]> {
  return db.select().from(complianceRequirements).where(and(
    eq(complianceRequirements.organizationId, org(ctx)), eq(complianceRequirements.packId, packId),
  )).orderBy(asc(complianceRequirements.sortOrder), asc(complianceRequirements.createdAt));
}

export async function updateComplianceRequirement(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  status: string; ownerName: string | null; dueDate: string | null;
  satisfiedByKind: string | null; satisfiedByRef: string | null; note: string | null;
  satisfiedBy: string | null; satisfiedAt: Date | null;
}>): Promise<void> {
  await db.update(complianceRequirements).set({ ...patch, updatedAt: new Date() }).where(and(
    eq(complianceRequirements.organizationId, org(ctx)), eq(complianceRequirements.id, id),
  ));
}

export async function nextComplianceExportVersion(
  db: AppDb, ctx: TenantContext, packId: string,
): Promise<number> {
  const [row] = await db.select({ max: sql<string>`coalesce(max(${complianceExports.version}), 0)::text` })
    .from(complianceExports).where(and(
      eq(complianceExports.organizationId, org(ctx)), eq(complianceExports.packId, packId),
    ));
  return Number(row?.max ?? 0) + 1;
}

export async function addComplianceExport(db: AppDb, ctx: TenantContext, input: {
  projectId: string; packId: string; version: number; objectKey: string;
  checksum: string; byteSize: number;
}): Promise<ComplianceExportRow> {
  const [row] = await db.insert(complianceExports).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId, packId: input.packId,
    version: input.version, objectKey: input.objectKey, checksum: input.checksum,
    byteSize: input.byteSize, createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function getComplianceExport(
  db: AppDb, ctx: TenantContext, id: string,
): Promise<ComplianceExportRow | null> {
  const [row] = await db.select().from(complianceExports).where(and(
    eq(complianceExports.organizationId, org(ctx)), eq(complianceExports.id, id),
  ));
  return row ?? null;
}

export async function listComplianceExports(
  db: AppDb, ctx: TenantContext, packId: string,
): Promise<ComplianceExportRow[]> {
  return db.select().from(complianceExports).where(and(
    eq(complianceExports.organizationId, org(ctx)), eq(complianceExports.packId, packId),
  )).orderBy(desc(complianceExports.version));
}
