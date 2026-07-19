import type { AppDb } from "@buildflow/db/client";
import type { StoragePort } from "@buildflow/storage/port";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { assertTransition, type ReportStatus } from "@buildflow/domain/report/state";
import { newId } from "@buildflow/domain/ids";
import { getReport, setReportStatus } from "@buildflow/db/queries/reports";
import { listAttachments } from "@buildflow/db/queries/attachments";
import { latestRevision } from "@buildflow/db/queries/revisions";
import { recordDecision } from "@buildflow/db/queries/review";
import { addIssued, latestIssued } from "@buildflow/db/queries/issued";
import { audit } from "@buildflow/db/queries/audit";
import { renderDprPdf, TEMPLATE_VERSION } from "@buildflow/pdf/render";
import type { DprStructuredData } from "@buildflow/domain/dpr/schema";
import { emitEvent } from "@/core/notifications-core";
import { projectReportDocument } from "@/core/search-core";

export async function approveReport(db: AppDb, ctx: TenantContext, reportId: string): Promise<void> {
  assertCan(ctx, "report.approve");
  await setReportStatus(db, ctx, reportId, "APPROVED");
  await recordDecision(db, ctx, { reportId, decision: "approve" });
  await audit(db, ctx, { action: "report.approved", subjectRef: reportId });
  const report = await getReport(db, ctx, reportId); // Phase E1 hook: field team learns the outcome
  await emitEvent(db, ctx, { eventKind: "report.approved", subjectRef: reportId, projectId: report.projectId, title: `DPR ${report.reportDate} approved` });
  await projectReportDocument(db, ctx, reportId); // Phase E3 hook: approved record enters search
}

export async function requestChanges(db: AppDb, ctx: TenantContext, reportId: string, reason: string): Promise<void> {
  assertCan(ctx, "report.review");
  await setReportStatus(db, ctx, reportId, "REJECTED");
  await recordDecision(db, ctx, { reportId, decision: "reject", reason });
  await audit(db, ctx, { action: "report.rejected", subjectRef: reportId, metadata: { reason } });
  const report = await getReport(db, ctx, reportId); // Phase E1 hook (title/ref only — no reason text in the body)
  await emitEvent(db, ctx, { eventKind: "report.rejected", subjectRef: reportId, projectId: report.projectId, title: `Changes requested on DPR ${report.reportDate}` });
}

export async function issueReport(db: AppDb, storage: StoragePort, ctx: TenantContext, reportId: string): Promise<string> {
  assertCan(ctx, "report.issue");
  const report = await getReport(db, ctx, reportId);
  // Approve-before-issue: fail closed BEFORE rendering/storing a PDF or writing an
  // issued_document row. The UI only hides the button; UI hiding is never authorization.
  assertTransition(report.status as ReportStatus, "ISSUED");
  const rev = await latestRevision(db, ctx, reportId);
  if (!rev) throw new Error("No revision to issue");

  const prev = await latestIssued(db, ctx, reportId);
  const version = (prev?.version ?? 0) + 1;
  const documentId = newId();

  // Embed up to 10 verified photo attachments as evidence pages. Bytes come only from
  // our own storage via stored object keys; encoded server-side as data URIs.
  const attachmentRows = await listAttachments(db, ctx, reportId);
  const photos = [];
  for (const att of attachmentRows.filter((a) => a.kind === "photo").slice(0, 10)) {
    try {
      const bytes = await storage.get(att.objectKey);
      photos.push({
        dataUri: `data:${att.contentType};base64,${Buffer.from(bytes).toString("base64")}`,
        capturedAt: att.capturedAt ? att.capturedAt.toISOString().slice(0, 16).replace("T", " ") : null,
      });
    } catch {
      // A missing derivative must not block issuance; the structured record stands alone.
    }
  }

  const pdf = await renderDprPdf({
    documentId, version, reportDate: report.reportDate,
    data: rev.structuredData as DprStructuredData,
    summaryClientSafe: rev.summaryClientSafe ?? "", issuedBy: ctx.userId,
    photos,
  });
  const objectKey = `org/${ctx.organizationId}/report/${reportId}/issued/${documentId}.pdf`;
  await storage.put(objectKey, pdf, "application/pdf");

  await addIssued(db, ctx, { reportId, revisionId: rev.id, objectKey, documentId, version, templateVersion: TEMPLATE_VERSION });
  await setReportStatus(db, ctx, reportId, "ISSUED");
  await audit(db, ctx, { action: "report.issued", subjectRef: reportId, metadata: { documentId, version } });
  return objectKey;
}

// --- Phase B additions: field decisions, failure recovery, client links ---

import { addRevision, getRevision } from "@buildflow/db/queries/revisions";
import { setCurrentRevision } from "@buildflow/db/queries/reports";
import { applyFieldDecision, type FieldDecision } from "@buildflow/domain/dpr/edit";
import { DPR_SCHEMA_VERSION } from "@buildflow/domain/dpr/schema";
import { enqueueJob } from "@buildflow/jobs/queue";
import { drainJobs } from "@buildflow/jobs/runner";
import { pipelineJobRegistry, REPORT_PROCESS_JOB } from "@buildflow/pipeline/jobs";
import { addClientLink, listClientLinks, revokeClientLink } from "@buildflow/db/queries/client-links";

export async function applyReviewFieldDecision(
  db: AppDb, ctx: TenantContext, reportId: string,
  input: { path: string; decision: FieldDecision; newValue?: unknown },
): Promise<void> {
  assertCan(ctx, "report.review");
  const report = await getReport(db, ctx, reportId);
  if (report.status !== "AWAITING_REVIEW") {
    throw new Error("Field decisions are only allowed while the report awaits review");
  }
  const rev = await latestRevision(db, ctx, reportId);
  if (!rev) throw new Error("No revision to edit");
  const { data, before, after } = applyFieldDecision(
    rev.structuredData as DprStructuredData, input.path, input.decision, input.newValue,
  );
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    const nextRev = await addRevision(tx, ctx, {
      reportId, structuredData: data, isAiGenerated: false,
      summaryInternal: rev.summaryInternal ?? undefined,
      summaryClientSafe: rev.summaryClientSafe ?? undefined,
      transcript: rev.transcript ?? undefined,
    });
    await setCurrentRevision(tx, ctx, reportId, nextRev.id);
    await recordDecision(tx, ctx, {
      reportId, decision: input.decision, fieldPath: input.path,
      revisionId: nextRev.id, beforeValue: before, afterValue: after,
    });
    await audit(tx, ctx, {
      action: "report.field_decision", subjectRef: reportId,
      metadata: { path: input.path, decision: input.decision, revisionId: nextRev.id },
    });
  });
}

const inlineJobs = () => (process.env.JOBS_MODE ?? "inline") !== "worker";

/** PROCESSING_FAILED -> PROCESSING with a fresh job. The status transition inside the
 * transaction makes double-clicks race-safe (second transition fails). */
export async function retryProcessing(db: AppDb, ctx: TenantContext, reportId: string): Promise<void> {
  assertCan(ctx, "report.review");
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    await setReportStatus(tx, ctx, reportId, "PROCESSING");
    await enqueueJob(tx, {
      organizationId: ctx.organizationId, kind: REPORT_PROCESS_JOB,
      payload: { reportId, userId: ctx.userId, projectId: ctx.projectId },
      idempotencyKey: `${REPORT_PROCESS_JOB}:${reportId}:retry:${newId()}`,
    });
    await audit(tx, ctx, { action: "report.processing_retried", subjectRef: reportId });
  });
  if (inlineJobs()) await drainJobs(db, pipelineJobRegistry);
}

/** PROCESSING_FAILED -> AWAITING_REVIEW with an empty human draft: inputs stay available,
 * the reviewer fills the record manually (design.md §7 recoverable failure). */
export async function createManualDraft(db: AppDb, ctx: TenantContext, reportId: string): Promise<void> {
  assertCan(ctx, "report.review");
  const empty: DprStructuredData = {
    schema_version: DPR_SCHEMA_VERSION,
    work_items: [], labour: [], materials: [], equipment: [], safety_quality: [],
    blockers: [], tomorrow_plan: [],
    weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" },
  };
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    const rev = await addRevision(tx, ctx, { reportId, structuredData: empty, isAiGenerated: false });
    await setCurrentRevision(tx, ctx, reportId, rev.id);
    await setReportStatus(tx, ctx, reportId, "AWAITING_REVIEW");
    await audit(tx, ctx, { action: "report.manual_draft_created", subjectRef: reportId, metadata: { revisionId: rev.id } });
  });
}

export async function createReportClientLink(
  db: AppDb, ctx: TenantContext, reportId: string,
): Promise<{ token: string; expiresAt: Date }> {
  assertCan(ctx, "report.issue");
  const report = await getReport(db, ctx, reportId);
  if (report.status !== "ISSUED" && report.status !== "SUPERSEDED") {
    throw new Error("Client links are only available for issued reports");
  }
  const issued = await latestIssued(db, ctx, reportId);
  if (!issued) throw new Error("No issued document");
  const link = await addClientLink(db, ctx, { reportId, issuedDocumentId: issued.id });
  await audit(db, ctx, { action: "client_link.created", subjectRef: reportId, metadata: { linkId: link.id, expiresAt: link.expiresAt.toISOString() } });
  return { token: link.token, expiresAt: link.expiresAt };
}

export async function revokeReportClientLink(
  db: AppDb, ctx: TenantContext, reportId: string, linkId: string,
): Promise<void> {
  assertCan(ctx, "report.issue");
  const links = await listClientLinks(db, ctx, reportId);
  if (!links.some((l) => l.id === linkId)) throw new Error("Link not found");
  await revokeClientLink(db, ctx, linkId);
  await audit(db, ctx, { action: "client_link.revoked", subjectRef: reportId, metadata: { linkId } });
}
