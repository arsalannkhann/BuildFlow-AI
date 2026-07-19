"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { currentContext } from "@/app/session";
import {
  addMbEvidencePhoto, certifyMbEntry, correctMbEntry, createMbEntry, editMbEntry,
  rejectMbEntry, submitMbEntry, verifyMbEntry,
} from "@/core/mb-core";

const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();
const opt = (fd: FormData, key: string): string | null => str(fd, key) || null;
const optInt = (fd: FormData, key: string): number | null => {
  const v = opt(fd, key);
  return v === null ? null : Number(v);
};
const optFloat = (fd: FormData, key: string): number | null => {
  const v = opt(fd, key);
  return v === null ? null : Number(v);
};

async function projectCtx(projectId: string) {
  const db = await getDb();
  const ctx = await currentContext();
  return { db, ctx: { ...ctx, projectId } };
}

const entryInput = (fd: FormData, projectId: string) => ({
  projectId,
  description: str(fd, "description"),
  measurementDate: str(fd, "measurementDate"),
  unit: str(fd, "unit"),
  length: opt(fd, "length"),
  breadth: opt(fd, "breadth"),
  depth: opt(fd, "depth"),
  count: optInt(fd, "count"),
  claimedQuantity: opt(fd, "claimedQuantity"),
  activityId: opt(fd, "activityId"),
  locationId: opt(fd, "locationId"),
  contractorId: opt(fd, "contractorId"),
});

export async function createMbEntryAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  const entryId = await createMbEntry(db, ctx, entryInput(formData, projectId));
  redirect(`/projects/${projectId}/mb/${entryId}`);
}

export async function editMbEntryAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const entryId = str(formData, "entryId");
  const { db, ctx } = await projectCtx(projectId);
  await editMbEntry(db, ctx, entryId, entryInput(formData, projectId));
  revalidatePath(`/projects/${projectId}/mb/${entryId}`);
}

export async function submitMbEntryAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const entryId = str(formData, "entryId");
  const { db, ctx } = await projectCtx(projectId);
  await submitMbEntry(db, ctx, entryId);
  revalidatePath(`/projects/${projectId}/mb/${entryId}`);
}

export async function verifyMbEntryAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const entryId = str(formData, "entryId");
  const { db, ctx } = await projectCtx(projectId);
  await verifyMbEntry(db, ctx, entryId);
  revalidatePath(`/projects/${projectId}/mb/${entryId}`);
}

export async function rejectMbEntryAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const entryId = str(formData, "entryId");
  const { db, ctx } = await projectCtx(projectId);
  await rejectMbEntry(db, ctx, entryId, str(formData, "reason"));
  revalidatePath(`/projects/${projectId}/mb/${entryId}`);
}

export async function certifyMbEntryAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const entryId = str(formData, "entryId");
  const { db, ctx } = await projectCtx(projectId);
  await certifyMbEntry(db, ctx, entryId);
  revalidatePath(`/projects/${projectId}/mb/${entryId}`);
  revalidatePath(`/projects/${projectId}/mb`);
}

export async function correctMbEntryAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const entryId = str(formData, "entryId");
  const { db, ctx } = await projectCtx(projectId);
  const correctionId = await correctMbEntry(db, ctx, entryId, entryInput(formData, projectId));
  redirect(`/projects/${projectId}/mb/${correctionId}`);
}

export async function addMbEvidenceAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const entryId = str(formData, "entryId");
  const { db, ctx } = await projectCtx(projectId);
  const upload = formData.get("photo") as File | null;
  if (!upload || upload.size === 0) throw new Error("Choose a photo");
  const capturedAt = opt(formData, "capturedAt");
  await addMbEvidencePhoto(db, ctx, new LocalFsStorage(), {
    entryId,
    bytes: new Uint8Array(await upload.arrayBuffer()),
    fileName: upload.name,
    contentType: upload.type || "application/octet-stream",
    latitude: optFloat(formData, "latitude"),
    longitude: optFloat(formData, "longitude"),
    capturedAt: capturedAt ? new Date(capturedAt) : null,
  });
  revalidatePath(`/projects/${projectId}/mb/${entryId}`);
}
