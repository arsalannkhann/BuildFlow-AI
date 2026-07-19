import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { equipment, equipmentAssignments, equipmentLogs, equipmentServices } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type Equipment = typeof equipment.$inferSelect;
export type EquipmentAssignment = typeof equipmentAssignments.$inferSelect;
export type EquipmentLog = typeof equipmentLogs.$inferSelect;
export type EquipmentService = typeof equipmentServices.$inferSelect;

const org = (ctx: TenantContext) => ctx.organizationId;

export async function listEquipment(db: AppDb, ctx: TenantContext): Promise<Equipment[]> {
  return db.select().from(equipment)
    .where(eq(equipment.organizationId, org(ctx)))
    .orderBy(asc(equipment.name));
}

export async function getEquipment(db: AppDb, ctx: TenantContext, id: string): Promise<Equipment | null> {
  const [row] = await db.select().from(equipment)
    .where(and(eq(equipment.organizationId, org(ctx)), eq(equipment.id, id)));
  return row ?? null;
}

export async function addEquipment(db: AppDb, ctx: TenantContext, input: {
  name: string; kind?: string | null; ownership?: string; supplierId?: string | null; identifier?: string | null;
}): Promise<Equipment> {
  const [row] = await db.insert(equipment).values({
    id: newId(), organizationId: org(ctx), name: input.name, kind: input.kind ?? null,
    ownership: input.ownership ?? "owned", supplierId: input.supplierId ?? null,
    identifier: input.identifier ?? null,
  }).returning();
  return row;
}

export async function addAssignment(db: AppDb, ctx: TenantContext, input: {
  projectId: string; equipmentId: string; fromDate: string; toDate?: string | null;
}): Promise<EquipmentAssignment> {
  const [row] = await db.insert(equipmentAssignments).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    equipmentId: input.equipmentId, fromDate: input.fromDate, toDate: input.toDate ?? null,
    createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function listAssignments(db: AppDb, ctx: TenantContext, projectId: string): Promise<EquipmentAssignment[]> {
  return db.select().from(equipmentAssignments)
    .where(and(eq(equipmentAssignments.organizationId, org(ctx)), eq(equipmentAssignments.projectId, projectId)))
    .orderBy(desc(equipmentAssignments.fromDate));
}

export async function endAssignment(db: AppDb, ctx: TenantContext, id: string, toDate: string): Promise<void> {
  await db.update(equipmentAssignments).set({ toDate })
    .where(and(eq(equipmentAssignments.organizationId, org(ctx)), eq(equipmentAssignments.id, id)));
}

// Append-only usage log — corrections are new rows, never edits.
export async function addEquipmentLog(db: AppDb, ctx: TenantContext, input: {
  projectId: string; equipmentId: string; logDate: string;
  hoursUsed?: string | null; fuelLitres?: string | null; downtimeHours?: string | null;
  note?: string | null; reportId?: string | null;
}): Promise<EquipmentLog> {
  const [row] = await db.insert(equipmentLogs).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    equipmentId: input.equipmentId, logDate: input.logDate,
    hoursUsed: input.hoursUsed ?? null, fuelLitres: input.fuelLitres ?? null,
    downtimeHours: input.downtimeHours ?? null, note: input.note ?? null,
    reportId: input.reportId ?? null, createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function listEquipmentLogs(
  db: AppDb, ctx: TenantContext, filter: { projectId?: string; equipmentId?: string },
): Promise<EquipmentLog[]> {
  return db.select().from(equipmentLogs).where(and(
    eq(equipmentLogs.organizationId, org(ctx)),
    filter.projectId ? eq(equipmentLogs.projectId, filter.projectId) : undefined,
    filter.equipmentId ? eq(equipmentLogs.equipmentId, filter.equipmentId) : undefined,
  )).orderBy(desc(equipmentLogs.logDate), desc(equipmentLogs.createdAt));
}

/** Cumulative logged usage hours per equipment id (decimal string). */
export async function cumulativeHours(db: AppDb, ctx: TenantContext, equipmentId: string): Promise<string> {
  const [row] = await db.select({
    total: sql<string>`coalesce(sum(${equipmentLogs.hoursUsed}), 0)::text`,
  }).from(equipmentLogs)
    .where(and(eq(equipmentLogs.organizationId, org(ctx)), eq(equipmentLogs.equipmentId, equipmentId)));
  return row?.total ?? "0";
}

export async function addService(db: AppDb, ctx: TenantContext, input: {
  equipmentId: string; name: string; dueDate?: string | null; dueHours?: string | null;
}): Promise<EquipmentService> {
  const [row] = await db.insert(equipmentServices).values({
    id: newId(), organizationId: org(ctx), equipmentId: input.equipmentId, name: input.name,
    dueDate: input.dueDate ?? null, dueHours: input.dueHours ?? null, createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function listServices(db: AppDb, ctx: TenantContext, equipmentId?: string): Promise<EquipmentService[]> {
  return db.select().from(equipmentServices).where(and(
    eq(equipmentServices.organizationId, org(ctx)),
    equipmentId ? eq(equipmentServices.equipmentId, equipmentId) : undefined,
  )).orderBy(asc(equipmentServices.dueDate));
}

export async function completeService(db: AppDb, ctx: TenantContext, id: string, note?: string): Promise<void> {
  await db.update(equipmentServices).set({ completedAt: new Date(), completedNote: note ?? null })
    .where(and(eq(equipmentServices.organizationId, org(ctx)), eq(equipmentServices.id, id)));
}
