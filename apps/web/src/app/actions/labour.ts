"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { recordAttendance, registerContractor } from "@/core/labour-core";

const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();
const opt = (fd: FormData, key: string): string | null => str(fd, key) || null;

async function projectCtx(projectId: string) {
  const db = await getDb();
  const ctx = await currentContext();
  return { db, ctx: { ...ctx, projectId } };
}

export async function registerContractorAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => registerContractor(tx, ctx, {
    name: str(formData, "name"),
    trade: opt(formData, "trade"),
    projectId,
  }));
  revalidatePath(`/projects/${projectId}/labour`);
}

export async function recordAttendanceAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => recordAttendance(tx, ctx, {
    projectId,
    attendanceDate: str(formData, "attendanceDate"),
    trade: str(formData, "trade"),
    headcount: Number(str(formData, "headcount")),
    contractorId: opt(formData, "contractorId"),
    hoursWorked: opt(formData, "hoursWorked"),
    activityId: opt(formData, "activityId"),
    note: opt(formData, "note"),
  }));
  revalidatePath(`/projects/${projectId}/labour`);
}
