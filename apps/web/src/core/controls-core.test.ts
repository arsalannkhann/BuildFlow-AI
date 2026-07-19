import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { listDocumentRevisions, getDocument, listRfis, listReportLinks, getScheduleItem } from "@buildflow/db/queries/controls";
import { submitReport } from "@/app/actions/capture-core";
import { approveReport } from "@/app/actions/review-core";
import {
  addScheduleDependency, createRfi, createScheduleItem, linkApprovedReport, projectOverview,
  raiseBlocker, recordProgress, registerDocument, resolveBlocker, uploadDocumentRevision,
} from "./controls-core";

async function setup() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-ctl-"));
  const db = await createTestDb();
  await seed(db);
  const eng = await resolveTenantContext(db, SEED.engineer.id);
  const mgr = await resolveTenantContext(db, SEED.manager.id);
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  return { db, eng, mgr, storage };
}

async function approvedReport(db: Awaited<ReturnType<typeof createTestDb>>, eng: any, mgr: any, storage: LocalFsStorage, date = "2026-07-18") {
  const reportId = await submitReport(db, storage, eng, {
    reportDate: date, audio: { bytes: new TextEncoder().encode("a"), contentType: "audio/webm" }, photos: [],
  });
  await approveReport(db, mgr, reportId);
  return reportId;
}

test("progress requires approved evidence; drafts are rejected; % never set by linking", async () => {
  const { db, eng, mgr, storage } = await setup();
  const itemId = await createScheduleItem(db, mgr, {
    projectId: SEED.projectId, name: "Third floor slab", baselineStart: "2026-07-01", baselineEnd: "2026-07-15",
  });

  // Draft (AWAITING_REVIEW) report is not usable as evidence.
  const draftId = await submitReport(db, storage, eng, {
    reportDate: "2026-07-17", audio: { bytes: new TextEncoder().encode("d"), contentType: "audio/webm" }, photos: [],
  });
  await expect(recordProgress(db, mgr, {
    projectId: SEED.projectId, scheduleItemId: itemId, percent: 40, evidenceReportId: draftId,
  })).rejects.toThrow(/approved/i);

  const approvedId = await approvedReport(db, eng, mgr, storage);
  await recordProgress(db, mgr, {
    projectId: SEED.projectId, scheduleItemId: itemId, percent: 40, evidenceReportId: approvedId,
  });
  expect((await getScheduleItem(db, mgr, itemId))?.progressPercent).toBe(40);

  // Linking a second approved report records evidence but never moves the percentage.
  const approved2 = await approvedReport(db, eng, mgr, storage, "2026-07-19");
  await linkApprovedReport(db, mgr, { projectId: SEED.projectId, reportId: approved2, scheduleItemId: itemId });
  expect((await getScheduleItem(db, mgr, itemId))?.progressPercent).toBe(40);
  expect((await listReportLinks(db, mgr, { scheduleItemId: itemId })).length).toBe(1);

  // Draft link refused; engineer lacks schedule.manage entirely.
  await expect(linkApprovedReport(db, mgr, { projectId: SEED.projectId, reportId: draftId, scheduleItemId: itemId }))
    .rejects.toThrow(/approved/i);
  await expect(recordProgress(db, eng, { projectId: SEED.projectId, scheduleItemId: itemId, percent: 50 }))
    .rejects.toThrow(/not permitted/i);
});

test("delay indicators are explainable from records only", async () => {
  const { db, mgr } = await setup();
  const late = await createScheduleItem(db, mgr, {
    projectId: SEED.projectId, name: "Basement waterproofing",
    baselineStart: "2026-06-01", baselineEnd: "2026-06-30",
  });
  await reviseDates(db, mgr, late, "2026-07-10");
  const blockerId = await raiseBlocker(db, mgr, {
    projectId: SEED.projectId, title: "Waterproofing membrane not delivered",
    severity: "high", scheduleItemId: late, dueDate: "2026-07-05",
  });

  const overview = await projectOverview(db, mgr, SEED.projectId, "2026-07-19");
  expect(overview.delayIndicators).toHaveLength(1);
  const ind = overview.delayIndicators[0];
  expect(ind.daysLate).toBe(9);
  expect(ind.baselineSlipDays).toBe(10);
  expect(ind.openBlockers.map((b) => b.id)).toEqual([blockerId]);
  expect(ind.explanation).toMatch(/behind baseline/);
  expect(ind.explanation).toMatch(/membrane not delivered/i);
  expect(ind.explanation).toMatch(/no approved report evidence/i);
  expect(overview.overdueBlockers.map((b) => b.id)).toEqual([blockerId]);

  await resolveBlocker(db, mgr, blockerId, "Delivered and installed");
  const after = await projectOverview(db, mgr, SEED.projectId, "2026-07-19");
  expect(after.overdueBlockers).toHaveLength(0);
  expect(after.delayIndicators[0].openBlockers).toHaveLength(0);

  async function noop() {}
  await noop();
});

async function reviseDates(db: any, ctx: any, itemId: string, currentEnd: string) {
  const { reviseScheduleDates } = await import("./controls-core");
  await reviseScheduleDates(db, ctx, itemId, { currentEnd, status: "in_progress" });
}

test("blocker resolution requires a note; RFIs number sequentially per project", async () => {
  const { db, mgr } = await setup();
  const b = await raiseBlocker(db, mgr, { projectId: SEED.projectId, title: "No water tanker" });
  await expect(resolveBlocker(db, mgr, b, "  ")).rejects.toThrow(/note/i);

  const r1 = await createRfi(db, mgr, { projectId: SEED.projectId, subject: "Column rebar", question: "Confirm dia at C4?" });
  const r2 = await createRfi(db, mgr, { projectId: SEED.projectId, subject: "Lintel level", question: "Level at door D2?" });
  const rows = await listRfis(db, mgr, SEED.projectId);
  expect(rows.map((r) => r.number)).toEqual([2, 1]);
  expect(rows.map((r) => r.id)).toEqual([r2, r1]);
});

test("document revisions are append-only with a moving current pointer", async () => {
  const { db, mgr, storage } = await setup();
  const docId = await registerDocument(db, mgr, {
    projectId: SEED.projectId, title: "GA drawing — Tower A", docNumber: "GA-001", category: "drawing",
  });
  await uploadDocumentRevision(db, mgr, storage, {
    documentId: docId, revisionLabel: "A",
    file: { bytes: new TextEncoder().encode("rev-a"), fileName: "ga-001-a.pdf", contentType: "application/pdf" },
  });
  await uploadDocumentRevision(db, mgr, storage, {
    documentId: docId, revisionLabel: "B", notes: "Column grid shifted 150mm",
    file: { bytes: new TextEncoder().encode("rev-b"), fileName: "ga-001-b.pdf", contentType: "application/pdf" },
  });
  const revs = await listDocumentRevisions(db, mgr, docId);
  expect(revs).toHaveLength(2);
  const doc = await getDocument(db, mgr, docId);
  const current = revs.find((r) => r.id === doc?.currentRevisionId);
  expect(current?.revisionLabel).toBe("B");
  expect(current?.status).toBe("issued");
  expect(revs.find((r) => r.revisionLabel === "A")?.status).toBe("superseded");
});

test("dependencies validate project membership of both items; cross-tenant reads fail closed", async () => {
  const { db, mgr } = await setup();
  const a = await createScheduleItem(db, mgr, { projectId: SEED.projectId, name: "Excavation" });
  const b = await createScheduleItem(db, mgr, { projectId: SEED.projectId, name: "Footings" });
  await addScheduleDependency(db, mgr, { projectId: SEED.projectId, predecessorId: a, successorId: b });
  await expect(addScheduleDependency(db, mgr, { projectId: SEED.projectId, predecessorId: a, successorId: a }))
    .rejects.toThrow(/itself/i);

  const foreign = { ...mgr, organizationId: "org-elsewhere" };
  expect(await getScheduleItem(db, foreign, a)).toBeNull();
});
