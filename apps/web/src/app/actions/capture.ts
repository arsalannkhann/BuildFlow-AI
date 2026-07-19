"use server";
import { redirect } from "next/navigation";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { getStorage } from "@buildflow/storage/factory";
import { currentContext } from "@/app/session";
import { submitReport, type UploadFile } from "./capture-core";
import { listProjects } from "@buildflow/db/queries/projects";
import { projectToday } from "@buildflow/domain/date-time";

async function toFile(f: File): Promise<UploadFile> {
  return { bytes: new Uint8Array(await f.arrayBuffer()), contentType: f.type || "application/octet-stream" };
}

export async function submitCaptureAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  const audio = formData.get("audio") as File | null;
  if (!audio || audio.size === 0) throw new Error("Audio is required");
  const photos = (formData.getAll("photos") as File[]).filter((f) => f.size > 0);
  if (audio.size > 25 * 1024 * 1024) throw new Error("Voice recording is too large (max 25 MB)");
  if (photos.length > 20) throw new Error("Attach no more than 20 photos");
  if (photos.some((photo) => photo.size > 15 * 1024 * 1024)) throw new Error("Each photo must be 15 MB or smaller");
  if (audio.size + photos.reduce((total, photo) => total + photo.size, 0) > 100 * 1024 * 1024) {
    throw new Error("Submission is too large (max 100 MB)");
  }
  const projects = await withTenant(db, ctx, (tx) => listProjects(tx, ctx));
  const project = projects.find((item) => item.id === ctx.projectId) ?? projects[0];
  if (!project) throw new Error("No project is assigned to this account");
  const scoped = { ...ctx, projectId: project.id };
  const reportId = await withTenant(db, scoped, async (tx) => submitReport(tx, getStorage(), scoped, {
    reportDate: projectToday(project.timezone),
    note: (formData.get("note") as string) || undefined,
    audio: await toFile(audio), photos: await Promise.all(photos.map(toFile)),
  }));
  redirect(`/reports/${reportId}`);
}
