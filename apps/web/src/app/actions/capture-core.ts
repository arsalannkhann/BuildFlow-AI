import type { AppDb } from "@buildflow/db/client";
import type { StoragePort } from "@buildflow/storage/port";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { newId } from "@buildflow/domain/ids";
import { createReport, setReportStatus } from "@buildflow/db/queries/reports";
import { addAttachment } from "@buildflow/db/queries/attachments";
import { enqueueJob } from "@buildflow/jobs/queue";
import { drainJobs } from "@buildflow/jobs/runner";
import { pipelineJobRegistry, REPORT_PROCESS_JOB } from "@buildflow/pipeline/jobs";

export type UploadFile = { bytes: Uint8Array; contentType: string };

// JOBS_MODE=worker defers processing to the polling worker (requires real Postgres —
// ADR-0003); the default runs jobs inline after commit so the zero-dependency PGlite
// setup stays single-process.
const inlineJobs = () => (process.env.JOBS_MODE ?? "inline") !== "worker";

export async function submitReport(
  db: AppDb, storage: StoragePort, ctx: TenantContext,
  input: { reportDate: string; note?: string; audio: UploadFile; photos: UploadFile[] },
): Promise<string> {
  assertCan(ctx, "report.create");

  // Object writes use opaque immutable keys, so orphans from a rolled-back transaction are
  // harmless; the DB rows + processing job commit atomically (transactional outbox).
  const reportId = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    const report = await createReport(tx, ctx, { reportDate: input.reportDate, note: input.note });

    const audioKey = `org/${ctx.organizationId}/report/${report.id}/audio/${newId()}.webm`;
    const audioMeta = await storage.put(audioKey, input.audio.bytes, input.audio.contentType);
    await addAttachment(tx, ctx, { reportId: report.id, kind: "audio", objectKey: audioKey,
      contentType: input.audio.contentType, byteSize: audioMeta.byteSize, checksum: audioMeta.checksum });

    for (const photo of input.photos) {
      const key = `org/${ctx.organizationId}/report/${report.id}/photo/${newId()}.jpg`;
      const meta = await storage.put(key, photo.bytes, photo.contentType);
      await addAttachment(tx, ctx, { reportId: report.id, kind: "photo", objectKey: key,
        contentType: photo.contentType, byteSize: meta.byteSize, checksum: meta.checksum });
    }

    await setReportStatus(tx, ctx, report.id, "PROCESSING");
    await enqueueJob(tx, {
      organizationId: ctx.organizationId,
      kind: REPORT_PROCESS_JOB,
      payload: { reportId: report.id, userId: ctx.userId, projectId: ctx.projectId },
      idempotencyKey: `${REPORT_PROCESS_JOB}:${report.id}`,
    });
    return report.id;
  });

  if (inlineJobs()) await drainJobs(db, pipelineJobRegistry);
  return reportId;
}
