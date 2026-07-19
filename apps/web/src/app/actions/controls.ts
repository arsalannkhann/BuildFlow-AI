"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { getStorage } from "@buildflow/storage/factory";
import { currentContext } from "@/app/session";
import {
  addScheduleDependency, createRfi, createScheduleItem, linkApprovedReport,
  raiseBlocker, recordProgress, registerDocument, resolveBlocker, respondToRfi,
  reviseScheduleDates, setRfiStatus, updateBlockerDetails, uploadDocumentRevision,
} from "@/core/controls-core";

const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();
const opt = (fd: FormData, key: string): string | null => str(fd, key) || null;

async function projectCtx(projectId: string) {
  const db = await getDb();
  const ctx = await currentContext();
  return { db, ctx: { ...ctx, projectId } };
}

export async function createScheduleItemAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => createScheduleItem(tx, ctx, {
    projectId,
    name: str(formData, "name"),
    isMilestone: formData.get("isMilestone") === "on",
    baselineStart: opt(formData, "baselineStart"),
    baselineEnd: opt(formData, "baselineEnd"),
    ownerName: opt(formData, "ownerName"),
  }));
  revalidatePath(`/projects/${projectId}/schedule`);
}

export async function reviseScheduleDatesAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => reviseScheduleDates(tx, ctx, str(formData, "itemId"), {
    currentStart: opt(formData, "currentStart"),
    currentEnd: opt(formData, "currentEnd"),
    status: str(formData, "status") || undefined,
    ownerName: opt(formData, "ownerName"),
  }));
  revalidatePath(`/projects/${projectId}/schedule`);
}

export async function recordProgressAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => recordProgress(tx, ctx, {
    projectId,
    scheduleItemId: str(formData, "itemId"),
    percent: Number(str(formData, "percent")),
    note: opt(formData, "note") ?? undefined,
    evidenceReportId: opt(formData, "evidenceReportId"),
  }));
  revalidatePath(`/projects/${projectId}/schedule`);
}

export async function addDependencyAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => addScheduleDependency(tx, ctx, {
    projectId,
    predecessorId: str(formData, "predecessorId"),
    successorId: str(formData, "successorId"),
  }));
  revalidatePath(`/projects/${projectId}/schedule`);
}

export async function linkReportAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const reportId = str(formData, "reportId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => linkApprovedReport(tx, ctx, {
    projectId, reportId,
    scheduleItemId: str(formData, "scheduleItemId"),
    note: opt(formData, "note") ?? undefined,
  }));
  revalidatePath(`/reports/${reportId}`);
}

export async function raiseBlockerAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => raiseBlocker(tx, ctx, {
    projectId,
    title: str(formData, "title"),
    description: opt(formData, "description") ?? undefined,
    severity: str(formData, "severity") || "medium",
    ownerName: opt(formData, "ownerName"),
    dueDate: opt(formData, "dueDate"),
    reportId: opt(formData, "reportId"),
    scheduleItemId: opt(formData, "scheduleItemId"),
  }));
  const back = opt(formData, "returnTo");
  if (back?.startsWith("/")) redirect(back);
  revalidatePath(`/projects/${projectId}/blockers`);
}

export async function resolveBlockerAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => resolveBlocker(tx, ctx, str(formData, "blockerId"), str(formData, "resolutionNote")));
  revalidatePath(`/projects/${projectId}/blockers`);
}

export async function updateBlockerAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => updateBlockerDetails(tx, ctx, str(formData, "blockerId"), {
    severity: str(formData, "severity") || undefined,
    ownerName: opt(formData, "ownerName"),
    dueDate: opt(formData, "dueDate"),
    status: str(formData, "status") || undefined,
  }));
  revalidatePath(`/projects/${projectId}/blockers`);
}

export async function createRfiAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  const rfiId = await withTenant(db, ctx, (tx) => createRfi(tx, ctx, {
    projectId,
    subject: str(formData, "subject"),
    question: str(formData, "question"),
    assigneeName: opt(formData, "assigneeName"),
    dueDate: opt(formData, "dueDate"),
  }));
  redirect(`/projects/${projectId}/rfis/${rfiId}`);
}

export async function respondToRfiAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const rfiId = str(formData, "rfiId");
  const { db, ctx } = await projectCtx(projectId);
  const upload = formData.get("file") as File | null;
  await withTenant(db, ctx, async (tx) => respondToRfi(tx, ctx, getStorage(), {
    rfiId,
    body: str(formData, "body"),
    markAnswered: formData.get("markAnswered") === "on",
    file: upload && upload.size > 0 ? {
      bytes: new Uint8Array(await upload.arrayBuffer()),
      fileName: upload.name, contentType: upload.type || "application/octet-stream",
    } : undefined,
  }));
  revalidatePath(`/projects/${projectId}/rfis/${rfiId}`);
}

export async function setRfiStatusAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const rfiId = str(formData, "rfiId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => setRfiStatus(tx, ctx, rfiId, str(formData, "status")));
  revalidatePath(`/projects/${projectId}/rfis/${rfiId}`);
}

export async function registerDocumentAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  const documentId = await withTenant(db, ctx, (tx) => registerDocument(tx, ctx, {
    projectId,
    title: str(formData, "title"),
    docNumber: opt(formData, "docNumber"),
    discipline: opt(formData, "discipline"),
    category: str(formData, "category") || "drawing",
  }));
  redirect(`/projects/${projectId}/documents/${documentId}`);
}

export async function uploadDocumentRevisionAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const documentId = str(formData, "documentId");
  const { db, ctx } = await projectCtx(projectId);
  const upload = formData.get("file") as File | null;
  await withTenant(db, ctx, async (tx) => uploadDocumentRevision(tx, ctx, getStorage(), {
    documentId,
    revisionLabel: str(formData, "revisionLabel"),
    notes: opt(formData, "notes") ?? undefined,
    file: upload && upload.size > 0 ? {
      bytes: new Uint8Array(await upload.arrayBuffer()),
      fileName: upload.name, contentType: upload.type || "application/octet-stream",
    } : undefined,
  }));
  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
}
