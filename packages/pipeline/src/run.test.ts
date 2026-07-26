import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { createReport, getReport, setReportStatus } from "@buildflow/db/queries/reports";
import { addAttachment, listAttachments, markAttachmentUploaded } from "@buildflow/db/queries/attachments";
import { latestRevision } from "@buildflow/db/queries/revisions";
import { synthesizeWebm } from "./audio-fixture";
import type { DprStructuredData } from "@buildflow/domain/dpr/schema";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { runProcessing } from "./run";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { processingStages, reportEntityLinks } from "@buildflow/db/schema";
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
  const { dailyReports } = await import("@buildflow/db/schema");
  await db.update(dailyReports).set({ status: "PROCESSING" });
  await runProcessing(db, ctx(), reportId);
  const after = (await latestRevision(db, ctx(), reportId))!.revisionNumber;
  expect(after).toBe(before + 1);
});

test("a short recording warns the reviewer, records its duration, and rejects nothing", async () => {
  // A six-second "daily update" is almost certainly incomplete. The engineer's work is kept;
  // the reviewer is told to look (T3.2).
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-pipe-short-"));
  const db = await createTestDb();
  await seed(db);
  const report = await createReport(db, ctx(), { reportDate: "2026-07-21" });
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  const key = `org/${SEED.orgId}/report/${report.id}/audio/short.webm`;
  const meta = await storage.put(key, synthesizeWebm(6_000), "audio/webm");
  await addAttachment(db, ctx(), { reportId: report.id, kind: "audio", objectKey: key,
    contentType: "audio/webm", byteSize: meta.byteSize, checksum: meta.checksum });
  await setReportStatus(db, ctx(), report.id, "PROCESSING");

  await runProcessing(db, ctx(), report.id);

  // Never auto-rejected: the report reaches review like any other.
  expect((await getReport(db, ctx(), report.id)).status).toBe("AWAITING_REVIEW");
  const audio = (await listAttachments(db, ctx(), report.id)).find((a) => a.kind === "audio");
  expect(audio?.durationMs).toBe(6000);
  const revision = await latestRevision(db, ctx(), report.id);
  const data = revision!.structuredData as DprStructuredData;
  expect(data.work_items.length).toBeGreaterThan(0);
  // Values preserved, confidence downgraded so the reviewer confirms rather than trusts.
  expect(data.work_items.every((item) => item.confidence_band !== "Supported")).toBe(true);
  expect(data.work_items[0].quantity.value).not.toBeNull();
  const stages = await db.select().from(processingStages);
  expect(stages.some((s) => s.name === "probeMedia" && s.status === "succeeded")).toBe(true);
  expect(stages.some((s) => s.name === "tagPhotos" && s.status === "succeeded")).toBe(true);
});

test("an uploaded photo is linked to the work item it evidences", async () => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-pipe-photo-"));
  const db = await createTestDb();
  await seed(db);
  const report = await createReport(db, ctx(), { reportDate: "2026-07-22" });
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);

  const audioKey = `org/${SEED.orgId}/report/${report.id}/audio/a.webm`;
  const audioMeta = await storage.put(audioKey, new TextEncoder().encode("audio-bytes"), "audio/webm");
  await addAttachment(db, ctx(), { reportId: report.id, kind: "audio", objectKey: audioKey,
    contentType: "audio/webm", byteSize: audioMeta.byteSize, checksum: audioMeta.checksum });

  const photoKey = `org/${SEED.orgId}/report/${report.id}/photo/p.jpg`;
  // "p1" selects the column-reinforcement fixture, which shares vocabulary with the mock
  // transcript's column work item — a deterministic match, not a lucky one.
  const photoMeta = await storage.put(photoKey, new TextEncoder().encode("p1"), "image/jpeg");
  const photo = await addAttachment(db, ctx(), { reportId: report.id, kind: "photo",
    objectKey: photoKey, contentType: "image/jpeg", byteSize: photoMeta.byteSize,
    checksum: photoMeta.checksum });
  await markAttachmentUploaded(db, ctx(), photo.id);
  await setReportStatus(db, ctx(), report.id, "PROCESSING");

  await runProcessing(db, ctx(), report.id);

  const revision = await latestRevision(db, ctx(), report.id);
  const data = revision!.structuredData as DprStructuredData;
  const attachmentIds = data.work_items
    .flatMap((item) => item.source_refs)
    .map((ref) => ref.attachment_id)
    .filter(Boolean);
  expect(attachmentIds).toContain(photo.id);
  // Evidence only: the quantity the engineer stated is untouched.
  expect(data.work_items[0].quantity).toEqual({ value: "2.5", unit: "cum" });
});

test("processing leaves an auditable trail of how the engineer's words were mapped", async () => {
  const { db, reportId } = await setup();
  await runProcessing(db, ctx(), reportId);

  const links = await db.select().from(reportEntityLinks)
    .where(eq(reportEntityLinks.reportId, reportId));
  expect(links.length).toBeGreaterThan(0);
  // Every row says WHICH tier decided it, so a mapping can be argued with later.
  for (const link of links) {
    expect(["exact", "alias", "fuzzy", "semantic", "llm", "manual", "unresolved"])
      .toContain(link.method);
    expect(link.rawText.length).toBeGreaterThan(0);
  }
  // The stage is recorded like every other, so a silent failure is visible in the run.
  const stages = await db.select().from(processingStages)
    .where(eq(processingStages.name, "resolveEntities"));
  expect(stages.map((stage) => stage.status)).toContain("succeeded");

  // The claims themselves are untouched: resolution attaches links, it never edits a report.
  const rev = await latestRevision(db, ctx(), reportId);
  const items = (rev?.structuredData as DprStructuredData).work_items;
  expect(items.length).toBeGreaterThan(0);
  expect(items.every((item) => item.description.length > 0)).toBe(true);
});
