import { and, asc, desc, eq, gte } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { labourAttendance, labourContractors } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type LabourContractor = typeof labourContractors.$inferSelect;
export type LabourAttendance = typeof labourAttendance.$inferSelect;

const org = (ctx: TenantContext) => ctx.organizationId;

export async function listContractors(db: AppDb, ctx: TenantContext, projectId?: string): Promise<LabourContractor[]> {
  const rows = await db.select().from(labourContractors)
    .where(eq(labourContractors.organizationId, org(ctx)))
    .orderBy(asc(labourContractors.name));
  // Org-wide contractors (projectId null) are visible everywhere.
  return projectId ? rows.filter((c) => !c.projectId || c.projectId === projectId) : rows;
}

export async function getContractor(db: AppDb, ctx: TenantContext, id: string): Promise<LabourContractor | null> {
  const [row] = await db.select().from(labourContractors)
    .where(and(eq(labourContractors.organizationId, org(ctx)), eq(labourContractors.id, id)));
  return row ?? null;
}

export async function addContractor(db: AppDb, ctx: TenantContext, input: {
  name: string; trade?: string | null; projectId?: string | null;
}): Promise<LabourContractor> {
  const [row] = await db.insert(labourContractors).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId ?? null,
    name: input.name, trade: input.trade ?? null,
  }).returning();
  return row;
}

// Daily TOTALS only — no individual worker identities (docs/PHASE-D-DESIGN.md).
export async function addAttendance(db: AppDb, ctx: TenantContext, input: {
  projectId: string; attendanceDate: string; trade: string; headcount: number;
  contractorId?: string | null; hoursWorked?: string | null;
  locationId?: string | null; activityId?: string | null; reportId?: string | null; note?: string | null;
}): Promise<LabourAttendance> {
  const [row] = await db.insert(labourAttendance).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    attendanceDate: input.attendanceDate, trade: input.trade, headcount: input.headcount,
    contractorId: input.contractorId ?? null, hoursWorked: input.hoursWorked ?? null,
    locationId: input.locationId ?? null, activityId: input.activityId ?? null,
    reportId: input.reportId ?? null, note: input.note ?? null, createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function listAttendance(
  db: AppDb, ctx: TenantContext, projectId: string, opts?: { fromDate?: string },
): Promise<LabourAttendance[]> {
  return db.select().from(labourAttendance).where(and(
    eq(labourAttendance.organizationId, org(ctx)), eq(labourAttendance.projectId, projectId),
    opts?.fromDate ? gte(labourAttendance.attendanceDate, opts.fromDate) : undefined,
  )).orderBy(desc(labourAttendance.attendanceDate), asc(labourAttendance.trade));
}
