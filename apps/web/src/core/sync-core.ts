import { createHash } from "node:crypto";
import type { AppDb } from "@buildflow/db/client";
import type { StoragePort } from "@buildflow/storage/port";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { newId } from "@buildflow/domain/ids";
import type { CreateReportRequest } from "@buildflow/contracts/v1";
import {
  createReport, getReport, getReportByClientId, setReportStatus,
} from "@buildflow/db/queries/reports";
import {
  getAttachment, listAttachments, markAttachmentUploaded, upsertManifestAttachment,
} from "@buildflow/db/queries/attachments";
import { audit } from "@buildflow/db/queries/audit";
import { enqueueJob } from "@buildflow/jobs/queue";
import { drainJobs } from "@buildflow/jobs/runner";
import { pipelineJobRegistry, REPORT_PROCESS_JOB } from "@buildflow/pipeline/jobs";

// Offline-first sync protocol (Architecture.MD §10):
//   1. POST manifest (idempotent per clientReportId)  -> SYNCING report + expected attachments
//   2. PUT each attachment's bytes (idempotent, checksum-verified)
//   3. POST finalize (idempotent)                     -> UPLOADED -> PROCESSING + job
// Every step can be retried after network loss or process death without duplicates.

export class SyncError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const EXT: Record<string, string> = { audio: "webm", photo: "jpg", document: "bin" };
const MAX_BYTES: Record<string, number> = {
  audio: 100 * 1024 * 1024, photo: 25 * 1024 * 1024, document: 50 * 1024 * 1024,
};

export type ManifestResult = {
  reportId: string;
  status: string;
  attachments: { clientAttachmentId: string; attachmentId: string; uploaded: boolean }[];
};

export async function upsertReportManifest(
  db: AppDb, ctx: TenantContext, input: CreateReportRequest,
): Promise<ManifestResult> {
  assertCan(ctx, "report.create");
  if (ctx.projectId !== input.projectId) throw new SyncError(403, "No membership for project");
  if (!input.attachments.some((a) => a.kind === "audio") ) {
    throw new SyncError(422, "A report needs at least one audio attachment");
  }
  for (const a of input.attachments) {
    if (a.byteSize > MAX_BYTES[a.kind]) throw new SyncError(413, `${a.kind} exceeds size limit`);
  }

  const existing = await getReportByClientId(db, ctx, input.clientReportId);
  const report = existing ?? await createReport(db, ctx, {
    reportDate: input.reportDate, note: input.note,
    status: "SYNCING", clientReportId: input.clientReportId,
  });
  if (!existing) {
    await audit(db, ctx, { action: "report.manifest_created", subjectRef: report.id, metadata: { clientReportId: input.clientReportId } });
  }

  const results: ManifestResult["attachments"] = [];
  for (const item of input.attachments) {
    const objectKey = `org/${ctx.organizationId}/report/${report.id}/${item.kind}/${newId()}.${EXT[item.kind]}`;
    const row = await upsertManifestAttachment(db, ctx, {
      reportId: report.id, clientAttachmentId: item.clientAttachmentId, kind: item.kind,
      objectKey, contentType: item.contentType, byteSize: item.byteSize, checksum: item.checksum,
      capturedAt: item.capturedAt ? new Date(item.capturedAt) : undefined,
    });
    results.push({
      clientAttachmentId: item.clientAttachmentId,
      attachmentId: row.id,
      uploaded: row.uploadedAt != null,
    });
  }
  return { reportId: report.id, status: report.status, attachments: results };
}

export async function storeAttachmentContent(
  db: AppDb, storage: StoragePort, ctx: TenantContext,
  reportId: string, attachmentId: string, bytes: Uint8Array,
): Promise<{ uploaded: true }> {
  assertCan(ctx, "report.create");
  const report = await getReport(db, ctx, reportId);
  const att = await getAttachment(db, ctx, attachmentId);
  if (!att || att.reportId !== report.id) throw new SyncError(404, "Attachment not found");
  if (att.uploadedAt) return { uploaded: true }; // idempotent retry

  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== att.checksum) throw new SyncError(422, "Checksum mismatch");
  if (bytes.byteLength !== att.byteSize) throw new SyncError(422, "Size mismatch");

  try {
    await storage.put(att.objectKey, bytes, att.contentType);
  } catch (err) {
    // The object is immutable; an existing object with a matching checksum means a retry
    // raced a crash between put and markUploaded — treat as success.
    if (!(err instanceof Error && /already exists/i.test(err.message))) throw err;
  }
  await markAttachmentUploaded(db, ctx, attachmentId);
  return { uploaded: true };
}

const inlineJobs = () => (process.env.JOBS_MODE ?? "inline") !== "worker";

export async function finalizeReport(
  db: AppDb, ctx: TenantContext, reportId: string,
): Promise<{ reportId: string; status: string }> {
  assertCan(ctx, "report.create");
  const report = await getReport(db, ctx, reportId);
  if (report.status !== "SYNCING") return { reportId, status: report.status }; // idempotent

  const atts = await listAttachments(db, ctx, reportId);
  const pending = atts.filter((a) => !a.uploadedAt);
  if (pending.length > 0) {
    throw new SyncError(409, `Uploads incomplete: ${pending.length} attachment(s) pending`);
  }
  if (!atts.some((a) => a.kind === "audio")) throw new SyncError(422, "Audio attachment missing");

  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    await setReportStatus(tx, ctx, reportId, "UPLOADED");
    await setReportStatus(tx, ctx, reportId, "PROCESSING");
    await enqueueJob(tx, {
      organizationId: ctx.organizationId, kind: REPORT_PROCESS_JOB,
      payload: { reportId, userId: ctx.userId, projectId: ctx.projectId },
      idempotencyKey: `${REPORT_PROCESS_JOB}:${reportId}`,
    });
    await audit(tx, ctx, { action: "report.finalized", subjectRef: reportId, metadata: {} });
  });
  if (inlineJobs()) await drainJobs(db, pipelineJobRegistry);
  const after = await getReport(db, ctx, reportId);
  return { reportId, status: after.status };
}
