"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { resolveTenantContext } from "@buildflow/auth/context";
import { getStorage } from "@buildflow/storage/factory";
import { currentContext } from "@/app/session";
import {
  addCustomComplianceRequirement, createCompliancePack, exportCompliancePack,
  markComplianceNotApplicable, reviewCompliancePack, satisfyComplianceRequirement,
  submitCompliancePack,
} from "@/core/compliance-core";

const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();
const opt = (fd: FormData, key: string): string | null => str(fd, key) || null;

async function projectCtx(projectId: string) {
  const db = await getDb();
  const base = await currentContext();
  return { db, ctx: await resolveTenantContext(db, base.userId, projectId) };
}

export async function createCompliancePackAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  const packId = await createCompliancePack(db, ctx, {
    projectId, kind: str(formData, "kind"), title: opt(formData, "title") ?? undefined,
    periodStart: str(formData, "periodStart"), periodEnd: str(formData, "periodEnd"),
  });
  redirect(`/projects/${projectId}/compliance/${packId}`);
}

export async function addComplianceRequirementAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const packId = str(formData, "packId");
  const { db, ctx } = await projectCtx(projectId);
  await addCustomComplianceRequirement(db, ctx, {
    packId, requirementText: str(formData, "requirementText"),
    ownerName: opt(formData, "ownerName"), dueDate: opt(formData, "dueDate"),
  });
  revalidatePath(`/projects/${projectId}/compliance/${packId}`);
}

export async function satisfyComplianceRequirementAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const packId = str(formData, "packId");
  const selected = str(formData, "evidence");
  const split = selected.indexOf(":");
  const kind = split < 0 ? selected : selected.slice(0, split);
  const ref = split < 0 ? null : selected.slice(split + 1);
  const { db, ctx } = await projectCtx(projectId);
  await satisfyComplianceRequirement(db, ctx, {
    requirementId: str(formData, "requirementId"), kind, ref, note: opt(formData, "note"),
  });
  revalidatePath(`/projects/${projectId}/compliance/${packId}`);
}

export async function markComplianceNotApplicableAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const packId = str(formData, "packId");
  const { db, ctx } = await projectCtx(projectId);
  await markComplianceNotApplicable(db, ctx, str(formData, "requirementId"), str(formData, "note"));
  revalidatePath(`/projects/${projectId}/compliance/${packId}`);
}

export async function submitCompliancePackAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const packId = str(formData, "packId");
  const { db, ctx } = await projectCtx(projectId);
  await submitCompliancePack(db, ctx, packId);
  revalidatePath(`/projects/${projectId}/compliance/${packId}`);
  revalidatePath(`/projects/${projectId}/compliance`);
}

export async function reviewCompliancePackAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const packId = str(formData, "packId");
  const { db, ctx } = await projectCtx(projectId);
  await reviewCompliancePack(db, ctx, packId);
  revalidatePath(`/projects/${projectId}/compliance/${packId}`);
  revalidatePath(`/projects/${projectId}/compliance`);
}

export async function exportCompliancePackAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const packId = str(formData, "packId");
  const { db, ctx } = await projectCtx(projectId);
  const row = await exportCompliancePack(db, ctx, getStorage(), packId);
  redirect(`/api/projects/${projectId}/compliance/${packId}/exports/${row.id}`);
}
