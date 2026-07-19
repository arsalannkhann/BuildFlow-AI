import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { cmpDecimal, isDecimalString, normalizeDecimal } from "@buildflow/domain/decimal";
import {
  addAssignment, addEquipment, addEquipmentLog, addService, completeService,
  cumulativeHours, getEquipment, listEquipment, listServices,
} from "@buildflow/db/queries/equipment";
import { audit } from "@buildflow/db/queries/audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const assertDate = (v: string | null | undefined, label: string) => {
  if (v != null && v !== "" && !DATE_RE.test(v)) throw new Error(`${label} must be YYYY-MM-DD`);
};

export async function registerEquipment(db: AppDb, ctx: TenantContext, input: {
  name: string; kind?: string | null; ownership?: string; supplierId?: string | null; identifier?: string | null;
}): Promise<string> {
  assertCan(ctx, "equipment.manage");
  if (!input.name?.trim()) throw new Error("Name is required");
  if (input.ownership && !["owned", "rented"].includes(input.ownership)) throw new Error("Ownership must be owned or rented");
  const row = await addEquipment(db, ctx, { ...input, name: input.name.trim() });
  await audit(db, ctx, { action: "equipment.registered", subjectRef: row.id, metadata: { ownership: row.ownership } });
  return row.id;
}

export async function assignEquipment(db: AppDb, ctx: TenantContext, input: {
  projectId: string; equipmentId: string; fromDate: string; toDate?: string | null;
}): Promise<void> {
  assertCan(ctx, "equipment.manage");
  if (!DATE_RE.test(input.fromDate)) throw new Error("From date must be YYYY-MM-DD");
  assertDate(input.toDate, "To date");
  if (input.toDate && input.toDate < input.fromDate) throw new Error("To date must not precede from date");
  if (!(await getEquipment(db, ctx, input.equipmentId))) throw new Error("Equipment not found");
  await addAssignment(db, ctx, input);
  await audit(db, ctx, { action: "equipment.assigned", subjectRef: input.equipmentId, metadata: { projectId: input.projectId } });
}

// Append-only: a wrong entry is corrected by a new row, never edited.
export async function logEquipmentUse(db: AppDb, ctx: TenantContext, input: {
  projectId: string; equipmentId: string; logDate: string;
  hoursUsed?: string | null; fuelLitres?: string | null; downtimeHours?: string | null; note?: string | null;
}): Promise<void> {
  assertCan(ctx, "equipment.manage");
  if (!DATE_RE.test(input.logDate)) throw new Error("Log date must be YYYY-MM-DD");
  if (!input.hoursUsed && !input.fuelLitres && !input.downtimeHours && !input.note?.trim()) {
    throw new Error("Record hours, fuel, downtime, or a note");
  }
  for (const [label, v] of [["Hours", input.hoursUsed], ["Fuel litres", input.fuelLitres], ["Downtime hours", input.downtimeHours]] as const) {
    if (v && !isDecimalString(v)) throw new Error(`${label} must be a decimal number`);
  }
  if (!(await getEquipment(db, ctx, input.equipmentId))) throw new Error("Equipment not found");
  await addEquipmentLog(db, ctx, {
    ...input,
    hoursUsed: input.hoursUsed ? normalizeDecimal(input.hoursUsed) : null,
    fuelLitres: input.fuelLitres ? normalizeDecimal(input.fuelLitres) : null,
    downtimeHours: input.downtimeHours ? normalizeDecimal(input.downtimeHours) : null,
  });
  await audit(db, ctx, { action: "equipment.usage_logged", subjectRef: input.equipmentId, metadata: { date: input.logDate } });
}

export async function scheduleService(db: AppDb, ctx: TenantContext, input: {
  equipmentId: string; name: string; dueDate?: string | null; dueHours?: string | null;
}): Promise<void> {
  assertCan(ctx, "equipment.manage");
  if (!input.name?.trim()) throw new Error("Service name is required");
  assertDate(input.dueDate, "Due date");
  if (input.dueHours && !isDecimalString(input.dueHours)) throw new Error("Due hours must be a decimal number");
  if (!input.dueDate && !input.dueHours) throw new Error("Set a due date and/or due hours");
  if (!(await getEquipment(db, ctx, input.equipmentId))) throw new Error("Equipment not found");
  await addService(db, ctx, {
    ...input, name: input.name.trim(),
    dueHours: input.dueHours ? normalizeDecimal(input.dueHours) : null,
  });
  await audit(db, ctx, { action: "equipment.service_scheduled", subjectRef: input.equipmentId, metadata: { name: input.name } });
}

export async function markServiceDone(db: AppDb, ctx: TenantContext, serviceId: string, note?: string): Promise<void> {
  assertCan(ctx, "equipment.manage");
  await completeService(db, ctx, serviceId, note);
  await audit(db, ctx, { action: "equipment.service_completed", subjectRef: serviceId, metadata: {} });
}

export type ServiceReminder = {
  serviceId: string;
  equipmentId: string;
  equipmentName: string;
  serviceName: string;
  reason: string; // deterministic rule, spelled out
};

const addDays = (iso: string, days: number): string =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Deterministic reminders only: due_date within `windowDays` (or past), OR cumulative
 * logged hours >= due_hours. Each reminder names the rule that fired — no prediction.
 */
export async function serviceReminders(
  db: AppDb, ctx: TenantContext,
  today: string = new Date().toISOString().slice(0, 10), windowDays = 14,
): Promise<ServiceReminder[]> {
  assertCan(ctx, "project.read");
  const [machines, services] = await Promise.all([listEquipment(db, ctx), listServices(db, ctx)]);
  const nameOf = new Map(machines.map((m) => [m.id, m.name]));
  const horizon = addDays(today, windowDays);
  const reminders: ServiceReminder[] = [];
  for (const service of services) {
    if (service.completedAt) continue;
    const reasons: string[] = [];
    if (service.dueDate && service.dueDate <= horizon) {
      reasons.push(service.dueDate < today
        ? `due date ${service.dueDate} has passed`
        : `due date ${service.dueDate} is within ${windowDays} days`);
    }
    if (service.dueHours) {
      const logged = await cumulativeHours(db, ctx, service.equipmentId);
      if (cmpDecimal(logged, service.dueHours) >= 0) {
        reasons.push(`${logged} logged hours have reached the ${service.dueHours}-hour service interval`);
      }
    }
    if (reasons.length === 0) continue;
    reminders.push({
      serviceId: service.id, equipmentId: service.equipmentId,
      equipmentName: nameOf.get(service.equipmentId) ?? "Unknown equipment",
      serviceName: service.name, reason: reasons.join("; "),
    });
  }
  return reminders;
}
