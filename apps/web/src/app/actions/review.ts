"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { currentContext } from "@/app/session";
import { approveReport, requestChanges, issueReport } from "./review-core";

export async function approveAction(formData: FormData): Promise<void> {
  const db = await getDb(); const ctx = await currentContext();
  const reportId = String(formData.get("reportId"));
  await approveReport(db, ctx, reportId);
  revalidatePath(`/reports/${reportId}`);
}
export async function requestChangesAction(formData: FormData): Promise<void> {
  const db = await getDb(); const ctx = await currentContext();
  const reportId = String(formData.get("reportId"));
  await requestChanges(db, ctx, reportId, String(formData.get("reason") ?? ""));
  revalidatePath(`/reports/${reportId}`);
}
export async function issueAction(formData: FormData): Promise<void> {
  const db = await getDb(); const ctx = await currentContext();
  const reportId = String(formData.get("reportId"));
  await issueReport(db, new LocalFsStorage(), ctx, reportId);
  revalidatePath(`/reports/${reportId}`);
}
