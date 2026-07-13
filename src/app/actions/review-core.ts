import type { AppDb } from "@/db/client";
import type { StoragePort } from "@/storage/port";
import type { TenantContext } from "@/domain/tenancy";
import { assertCan } from "@/domain/tenancy";
import { assertTransition, type ReportStatus } from "@/domain/report/state";
import { newId } from "@/domain/ids";
import { getReport, setReportStatus } from "@/db/queries/reports";
import { latestRevision } from "@/db/queries/revisions";
import { recordDecision } from "@/db/queries/review";
import { addIssued, latestIssued } from "@/db/queries/issued";
import { audit } from "@/db/queries/audit";
import { renderDprPdf, TEMPLATE_VERSION } from "@/pdf/render";
import type { DprStructuredData } from "@/domain/dpr/schema";

export async function approveReport(db: AppDb, ctx: TenantContext, reportId: string): Promise<void> {
  assertCan(ctx, "report.approve");
  await setReportStatus(db, ctx, reportId, "APPROVED");
  await recordDecision(db, ctx, { reportId, decision: "approve" });
  await audit(db, ctx, { action: "report.approved", subjectRef: reportId });
}

export async function requestChanges(db: AppDb, ctx: TenantContext, reportId: string, reason: string): Promise<void> {
  assertCan(ctx, "report.review");
  await setReportStatus(db, ctx, reportId, "REJECTED");
  await recordDecision(db, ctx, { reportId, decision: "reject", reason });
  await audit(db, ctx, { action: "report.rejected", subjectRef: reportId, metadata: { reason } });
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
  const pdf = await renderDprPdf({
    documentId, version, reportDate: report.reportDate,
    data: rev.structuredData as DprStructuredData,
    summaryClientSafe: rev.summaryClientSafe ?? "", issuedBy: ctx.userId,
  });
  const objectKey = `org/${ctx.organizationId}/report/${reportId}/issued/${documentId}.pdf`;
  await storage.put(objectKey, pdf, "application/pdf");

  await addIssued(db, ctx, { reportId, revisionId: rev.id, objectKey, documentId, version, templateVersion: TEMPLATE_VERSION });
  await setReportStatus(db, ctx, reportId, "ISSUED");
  await audit(db, ctx, { action: "report.issued", subjectRef: reportId, metadata: { documentId, version } });
  return objectKey;
}
