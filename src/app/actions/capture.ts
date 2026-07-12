"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { LocalFsStorage } from "@/storage/local-fs";
import { currentContext } from "@/app/session";
import { submitReport, type UploadFile } from "./capture-core";

async function toFile(f: File): Promise<UploadFile> {
  return { bytes: new Uint8Array(await f.arrayBuffer()), contentType: f.type || "application/octet-stream" };
}

export async function submitCaptureAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  const audio = formData.get("audio") as File | null;
  if (!audio || audio.size === 0) throw new Error("Audio is required");
  const photos = (formData.getAll("photos") as File[]).filter((f) => f.size > 0);
  const reportId = await submitReport(db, new LocalFsStorage(), ctx, {
    reportDate: String(formData.get("reportDate") ?? new Date().toISOString().slice(0, 10)),
    note: (formData.get("note") as string) || undefined,
    audio: await toFile(audio), photos: await Promise.all(photos.map(toFile)),
  });
  redirect(`/reports/${reportId}`);
}
