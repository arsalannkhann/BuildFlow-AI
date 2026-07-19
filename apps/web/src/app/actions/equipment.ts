"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import {
  assignEquipment, logEquipmentUse, markServiceDone, registerEquipment, scheduleService,
} from "@/core/equipment-core";

const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();
const opt = (fd: FormData, key: string): string | null => str(fd, key) || null;

async function projectCtx(projectId: string) {
  const db = await getDb();
  const ctx = await currentContext();
  return { db, ctx: { ...ctx, projectId } };
}

export async function registerEquipmentAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => registerEquipment(tx, ctx, {
    name: str(formData, "name"),
    kind: opt(formData, "kind"),
    ownership: str(formData, "ownership") || "owned",
    identifier: opt(formData, "identifier"),
  }));
  revalidatePath(`/projects/${projectId}/equipment`);
}

export async function assignEquipmentAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => assignEquipment(tx, ctx, {
    projectId,
    equipmentId: str(formData, "equipmentId"),
    fromDate: str(formData, "fromDate"),
    toDate: opt(formData, "toDate"),
  }));
  revalidatePath(`/projects/${projectId}/equipment`);
}

export async function logEquipmentUseAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => logEquipmentUse(tx, ctx, {
    projectId,
    equipmentId: str(formData, "equipmentId"),
    logDate: str(formData, "logDate"),
    hoursUsed: opt(formData, "hoursUsed"),
    fuelLitres: opt(formData, "fuelLitres"),
    downtimeHours: opt(formData, "downtimeHours"),
    note: opt(formData, "note"),
  }));
  revalidatePath(`/projects/${projectId}/equipment`);
}

export async function scheduleServiceAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => scheduleService(tx, ctx, {
    equipmentId: str(formData, "equipmentId"),
    name: str(formData, "name"),
    dueDate: opt(formData, "dueDate"),
    dueHours: opt(formData, "dueHours"),
  }));
  revalidatePath(`/projects/${projectId}/equipment`);
}

export async function markServiceDoneAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => markServiceDone(tx, ctx, str(formData, "serviceId"), opt(formData, "note") ?? undefined));
  revalidatePath(`/projects/${projectId}/equipment`);
}
