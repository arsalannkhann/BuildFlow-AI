import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@/db/client";
import { seed, SEED } from "@/db/seed";
import { createReport, getReport, setReportStatus } from "@/db/queries/reports";
import { addAttachment } from "@/db/queries/attachments";
import { latestRevision } from "@/db/queries/revisions";
import { LocalFsStorage } from "@/storage/local-fs";
import { runProcessing } from "./run";
import type { TenantContext } from "@/domain/tenancy";
import { processingStages } from "@/db/schema";
import { eq } from "drizzle-orm";

const ctx = (): TenantContext => ({ organizationId: SEED.orgId, projectId: SEED.projectId,
  userId: SEED.engineer.id, capabilities: ["report.create", "report.review"] });

async function setup() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-pipe-"));
  const db = await createTestDb();
  await seed(db);
  const r = await createReport(db, ctx(), { reportDate: "2026-07-13" });
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  const key = `org/${SEED.orgId}/report/${r.id}/audio/a.webm`;
  const meta = await storage.put(key, new TextEncoder().encode("audio-bytes"), "audio/webm");
  await addAttachment(db, ctx(), { reportId: r.id, kind: "audio", objectKey: key,
    contentType: "audio/webm", byteSize: meta.byteSize, checksum: meta.checksum });
  await setReportStatus(db, ctx(), r.id, "PROCESSING");
  return { db, reportId: r.id };
}

test("runProcessing produces a schema-valid AI revision and AWAITING_REVIEW", async () => {
  const { db, reportId } = await setup();
  await runProcessing(db, ctx(), reportId);
  expect((await getReport(db, ctx(), reportId)).status).toBe("AWAITING_REVIEW");
  const rev = await latestRevision(db, ctx(), reportId);
  expect(rev?.isAiGenerated).toBe(true);
  expect((rev?.structuredData as any).work_items.length).toBeGreaterThan(0);
});

test("runProcessing without audio fails into PROCESSING_FAILED, inputs preserved", async () => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-pipe2-"));
  const db = await createTestDb();
  await seed(db);
  const r = await createReport(db, ctx(), { reportDate: "2026-07-13" });
  await setReportStatus(db, ctx(), r.id, "PROCESSING");
  await runProcessing(db, ctx(), r.id);
  expect((await getReport(db, ctx(), r.id)).status).toBe("PROCESSING_FAILED");
  const stages = await db.select().from(processingStages).where(eq(processingStages.status, "failed"));
  expect(stages.some((s) => s.name === "validateManifest")).toBe(true);
});

test("a retry from PROCESSING creates exactly one more revision", async () => {
  const { db, reportId } = await setup();
  await runProcessing(db, ctx(), reportId);
  const before = (await latestRevision(db, ctx(), reportId))!.revisionNumber;
  const { dailyReports } = await import("@/db/schema");
  await db.update(dailyReports).set({ status: "PROCESSING" });
  await runProcessing(db, ctx(), reportId);
  const after = (await latestRevision(db, ctx(), reportId))!.revisionNumber;
  expect(after).toBe(before + 1);
});
