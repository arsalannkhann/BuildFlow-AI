import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { submitReport } from "./capture-core";
import { getReport } from "@buildflow/db/queries/reports";
import { listAttachments } from "@buildflow/db/queries/attachments";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { resolveTenantContext } from "@buildflow/auth/context";

test("submitReport stores audio+photo, creates report, runs pipeline to AWAITING_REVIEW", async () => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-cap-"));
  const db = await createTestDb();
  await seed(db);
  const ctx = await resolveTenantContext(db, SEED.engineer.id);
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);

  const audio = new TextEncoder().encode("fake-audio");
  const photo = new TextEncoder().encode("fake-photo");
  const reportId = await submitReport(db, storage, ctx, {
    reportDate: "2026-07-13", note: "column done",
    audio: { bytes: audio, contentType: "audio/webm" },
    photos: [{ bytes: photo, contentType: "image/jpeg" }],
  });

  expect((await getReport(db, ctx, reportId)).status).toBe("AWAITING_REVIEW");
  const atts = await listAttachments(db, ctx, reportId);
  expect(atts.filter((a) => a.kind === "audio")).toHaveLength(1);
  expect(atts.filter((a) => a.kind === "photo")).toHaveLength(1);
});
