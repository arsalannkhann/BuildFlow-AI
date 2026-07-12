import type { AppDb } from "@/db/client";
import type { StoragePort } from "@/storage/port";
import type { TenantContext } from "@/domain/tenancy";
import { assertCan } from "@/domain/tenancy";
import { newId } from "@/domain/ids";
import { createReport, setReportStatus } from "@/db/queries/reports";
import { addAttachment } from "@/db/queries/attachments";
import { runProcessing } from "@/pipeline/run";

export type UploadFile = { bytes: Uint8Array; contentType: string };

export async function submitReport(
  db: AppDb, storage: StoragePort, ctx: TenantContext,
  input: { reportDate: string; note?: string; audio: UploadFile; photos: UploadFile[] },
): Promise<string> {
  assertCan(ctx, "report.create");
  const report = await createReport(db, ctx, { reportDate: input.reportDate, note: input.note });

  const audioKey = `org/${ctx.organizationId}/report/${report.id}/audio/${newId()}.webm`;
  const audioMeta = await storage.put(audioKey, input.audio.bytes, input.audio.contentType);
  await addAttachment(db, ctx, { reportId: report.id, kind: "audio", objectKey: audioKey,
    contentType: input.audio.contentType, byteSize: audioMeta.byteSize, checksum: audioMeta.checksum });

  for (const photo of input.photos) {
    const key = `org/${ctx.organizationId}/report/${report.id}/photo/${newId()}.jpg`;
    const meta = await storage.put(key, photo.bytes, photo.contentType);
    await addAttachment(db, ctx, { reportId: report.id, kind: "photo", objectKey: key,
      contentType: photo.contentType, byteSize: meta.byteSize, checksum: meta.checksum });
  }

  await setReportStatus(db, ctx, report.id, "PROCESSING");
  await runProcessing(db, ctx, report.id); // in-process stand-in for the durable worker
  return report.id;
}
