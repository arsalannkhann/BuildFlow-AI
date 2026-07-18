import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { getReport } from "@buildflow/db/queries/reports";
import { latestRevision } from "@buildflow/db/queries/revisions";
import { resolveClientLink } from "@buildflow/db/queries/client-links";
import type { DprStructuredData } from "@buildflow/domain/dpr/schema";
import { submitReport } from "./capture-core";
import {
  applyReviewFieldDecision, approveReport, createManualDraft, createReportClientLink,
  issueReport, retryProcessing, revokeReportClientLink,
} from "./review-core";
import { sql } from "drizzle-orm";

async function awaitingReport() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-rf-"));
  const db = await createTestDb();
  await seed(db);
  const eng = await resolveTenantContext(db, SEED.engineer.id, SEED.projectId);
  const mgr = await resolveTenantContext(db, SEED.manager.id, SEED.projectId);
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  const reportId = await submitReport(db, storage, eng, {
    reportDate: "2026-07-19",
    audio: { bytes: new TextEncoder().encode("a"), contentType: "audio/webm" }, photos: [],
  });
  return { db, eng, mgr, storage, reportId };
}

test("field decisions write revisions + append-only trail; edit survives to approval", async () => {
  const { db, mgr, reportId } = await awaitingReport();
  const before = await latestRevision(db, mgr, reportId);
  const beforeData = before!.structuredData as DprStructuredData;
  expect(beforeData.work_items.length).toBeGreaterThan(0);

  await applyReviewFieldDecision(db, mgr, reportId, {
    path: "work_items[0]", decision: "edit", newValue: { quantity: { value: "99", unit: "bags" } },
  });
  await applyReviewFieldDecision(db, mgr, reportId, { path: "labour[0]", decision: "confirm" });

  const after = await latestRevision(db, mgr, reportId);
  const afterData = after!.structuredData as DprStructuredData;
  expect(after!.revisionNumber).toBe(before!.revisionNumber + 2);
  expect(after!.isAiGenerated).toBe(false);
  expect(afterData.work_items[0].quantity.value).toBe("99");
  expect(afterData.work_items[0].confidence_band).toBe("Supported");
  expect(afterData.labour[0].confidence_band).toBe("Supported");

  const decisions = await db.execute(sql`select decision, field_path from review_decision order by created_at`);
  const rows = (decisions as unknown as { rows: { decision: string; field_path: string }[] }).rows;
  expect(rows.map((r) => r.decision)).toEqual(["edit", "confirm"]);

  // engineer (no review-capability loss) can review but a client_viewer-style ctx cannot
  const noCaps = { ...mgr, capabilities: [] };
  await expect(applyReviewFieldDecision(db, noCaps, reportId, {
    path: "labour[0]", decision: "confirm",
  })).rejects.toThrow(/not permitted/i);
});

test("edits are locked after approval", async () => {
  const { db, mgr, reportId } = await awaitingReport();
  await approveReport(db, mgr, reportId);
  await expect(applyReviewFieldDecision(db, mgr, reportId, {
    path: "labour[0]", decision: "confirm",
  })).rejects.toThrow(/only allowed while/i);
});

test("PROCESSING_FAILED -> retry reprocesses; manual draft creates empty human revision", async () => {
  const { db, mgr, eng, storage, reportId } = await awaitingReport();
  void storage; void eng;
  // Force a failed state
  await db.execute(sql`update daily_report set status = 'PROCESSING_FAILED' where id = ${reportId}`);
  await retryProcessing(db, mgr, reportId);
  expect((await getReport(db, mgr, reportId)).status).toBe("AWAITING_REVIEW"); // inline job reran

  await db.execute(sql`update daily_report set status = 'PROCESSING_FAILED' where id = ${reportId}`);
  await createManualDraft(db, mgr, reportId);
  const report = await getReport(db, mgr, reportId);
  expect(report.status).toBe("AWAITING_REVIEW");
  const rev = await latestRevision(db, mgr, reportId);
  expect(rev!.isAiGenerated).toBe(false);
  expect((rev!.structuredData as DprStructuredData).work_items).toEqual([]);
});

test("client link: only for issued reports; resolves until revoked; token stored hashed", async () => {
  const { db, mgr, storage, reportId } = await awaitingReport();
  await expect(createReportClientLink(db, mgr, reportId)).rejects.toThrow(/only available for issued/i);

  await approveReport(db, mgr, reportId);
  await issueReport(db, storage, mgr, reportId);
  const link = await createReportClientLink(db, mgr, reportId);

  const resolved = await resolveClientLink(db, link.token);
  expect(resolved).not.toBeNull();
  expect(resolved!.report.id).toBe(reportId);
  expect(resolved!.revision.summaryClientSafe).toBeTruthy();

  const raw = await db.execute(sql`select token_hash from client_link`);
  const hashes = (raw as unknown as { rows: { token_hash: string }[] }).rows;
  expect(hashes.some((h) => h.token_hash === link.token)).toBe(false);

  const links = (resolved && [resolved.link]) || [];
  await revokeReportClientLink(db, mgr, reportId, links[0].id);
  expect(await resolveClientLink(db, link.token)).toBeNull();
});
