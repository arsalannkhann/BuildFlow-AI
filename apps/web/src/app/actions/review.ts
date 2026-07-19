"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { getStorage } from "@buildflow/storage/factory";
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
  await issueReport(db, getStorage(), ctx, reportId);
  revalidatePath(`/reports/${reportId}`);
}

import { redirect } from "next/navigation";
import { FIELD_DECISIONS, type FieldDecision } from "@buildflow/domain/dpr/edit";
import {
  applyReviewFieldDecision, createManualDraft, createReportClientLink,
  retryProcessing, revokeReportClientLink,
} from "./review-core";

export async function fieldDecisionAction(formData: FormData): Promise<void> {
  const db = await getDb(); const ctx = await currentContext();
  const reportId = String(formData.get("reportId"));
  const decision = String(formData.get("decision")) as FieldDecision;
  if (!FIELD_DECISIONS.includes(decision)) throw new Error(`Unknown decision: ${decision}`);
  const rawValue = formData.get("newValue");
  const newValue = typeof rawValue === "string" && rawValue.trim() !== ""
    ? JSON.parse(rawValue) as unknown : undefined;
  await applyReviewFieldDecision(db, ctx, reportId, {
    path: String(formData.get("path")), decision, newValue,
  });
  revalidatePath(`/reports/${reportId}`);
}

export async function retryProcessingAction(formData: FormData): Promise<void> {
  const db = await getDb(); const ctx = await currentContext();
  const reportId = String(formData.get("reportId"));
  await retryProcessing(db, ctx, reportId);
  revalidatePath(`/reports/${reportId}`);
}

export async function manualDraftAction(formData: FormData): Promise<void> {
  const db = await getDb(); const ctx = await currentContext();
  const reportId = String(formData.get("reportId"));
  await createManualDraft(db, ctx, reportId);
  revalidatePath(`/reports/${reportId}`);
}

export async function createClientLinkAction(formData: FormData): Promise<void> {
  const db = await getDb(); const ctx = await currentContext();
  const reportId = String(formData.get("reportId"));
  const link = await createReportClientLink(db, ctx, reportId);
  redirect(`/reports/${reportId}?clientLink=${encodeURIComponent(link.token)}`);
}

export async function revokeClientLinkAction(formData: FormData): Promise<void> {
  const db = await getDb(); const ctx = await currentContext();
  const reportId = String(formData.get("reportId"));
  await revokeReportClientLink(db, ctx, reportId, String(formData.get("linkId")));
  revalidatePath(`/reports/${reportId}`);
}
