import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { listAttachments } from "@buildflow/db/queries/attachments";
import { getReport } from "@buildflow/db/queries/reports";
import { finalizeReport, storeAttachmentContent, upsertReportManifest, SyncError } from "./sync-core";

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

async function setup() {
  const db = await createTestDb();
  await seed(db);
  const ctx = await resolveTenantContext(db, SEED.engineer.id, SEED.projectId);
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-sync-"));
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  const audio = new TextEncoder().encode("audio-bytes");
  const photo = new TextEncoder().encode("photo-bytes");
  const manifest = {
    clientReportId: "device-1-report-1",
    projectId: SEED.projectId,
    reportDate: "2026-07-19",
    note: "offline capture",
    attachments: [
      { clientAttachmentId: "a1", kind: "audio" as const, contentType: "audio/webm",
        byteSize: audio.byteLength, checksum: sha256(audio) },
      { clientAttachmentId: "p1", kind: "photo" as const, contentType: "image/jpeg",
        byteSize: photo.byteLength, checksum: sha256(photo) },
    ],
  };
  return { db, ctx, storage, audio, photo, manifest };
}

test("full offline sync: manifest -> uploads -> finalize -> processed; every step replays without duplicates", async () => {
  const { db, ctx, storage, audio, photo, manifest } = await setup();

  const first = await upsertReportManifest(db, ctx, manifest);
  expect(first.status).toBe("SYNCING");
  expect(first.attachments).toHaveLength(2);

  // Replayed manifest (device restarted before recording the response): same report.
  const replay = await upsertReportManifest(db, ctx, manifest);
  expect(replay.reportId).toBe(first.reportId);
  expect(replay.attachments.map((a) => a.attachmentId).sort())
    .toEqual(first.attachments.map((a) => a.attachmentId).sort());

  // Finalize before uploads must refuse.
  await expect(finalizeReport(db, ctx, first.reportId)).rejects.toThrow(/incomplete/i);

  const [a1, p1] = first.attachments;
  await storeAttachmentContent(db, storage, ctx, first.reportId, a1.attachmentId, audio);
  // duplicate upload retry is a no-op
  await storeAttachmentContent(db, storage, ctx, first.reportId, a1.attachmentId, audio);
  await storeAttachmentContent(db, storage, ctx, first.reportId, p1.attachmentId, photo);

  const done = await finalizeReport(db, ctx, first.reportId);
  expect(done.status).toBe("AWAITING_REVIEW"); // inline jobs processed the report

  // Finalize retry after success is a no-op, not a duplicate pipeline run.
  const again = await finalizeReport(db, ctx, first.reportId);
  expect(again.status).toBe("AWAITING_REVIEW");

  const atts = await listAttachments(db, ctx, first.reportId);
  expect(atts).toHaveLength(2);
  expect((await getReport(db, ctx, first.reportId)).clientReportId).toBe("device-1-report-1");
});

test("corrupt upload is rejected by checksum; wrong project is refused", async () => {
  const { db, ctx, storage, manifest } = await setup();
  const result = await upsertReportManifest(db, ctx, manifest);
  const [a1] = result.attachments;
  await expect(
    storeAttachmentContent(db, storage, ctx, result.reportId, a1.attachmentId,
      new TextEncoder().encode("tampered")),
  ).rejects.toThrow(/checksum|size/i);

  await expect(
    upsertReportManifest(db, ctx, { ...manifest, clientReportId: "r2", projectId: "other-project" }),
  ).rejects.toThrow(SyncError);
});

test("manifest without audio is refused", async () => {
  const { db, ctx, manifest } = await setup();
  await expect(
    upsertReportManifest(db, ctx, {
      ...manifest, clientReportId: "r3",
      attachments: manifest.attachments.filter((a) => a.kind !== "audio"),
    }),
  ).rejects.toThrow(/audio/i);
});
