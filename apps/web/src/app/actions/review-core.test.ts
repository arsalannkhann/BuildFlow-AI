import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { submitReport } from "./capture-core";
import { approveReport, requestChanges, issueReport } from "./review-core";
import { getReport } from "@buildflow/db/queries/reports";
import { latestIssued } from "@buildflow/db/queries/issued";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { resolveTenantContext } from "@buildflow/auth/context";

async function makeAwaiting() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-rev-"));
  const db = await createTestDb();
  await seed(db);
  const eng = await resolveTenantContext(db, SEED.engineer.id);
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  const reportId = await submitReport(db, storage, eng, {
    reportDate: "2026-07-13", audio: { bytes: new TextEncoder().encode("a"), contentType: "audio/webm" }, photos: [] });
  return { db, reportId };
}

test("engineer without approve capability is denied", async () => {
  const { db, reportId } = await makeAwaiting();
  const eng = await resolveTenantContext(db, SEED.engineer.id);
  await expect(approveReport(db, eng, reportId)).rejects.toThrow(/not permitted/i);
});

test("manager approves; report becomes APPROVED", async () => {
  const { db, reportId } = await makeAwaiting();
  const mgr = await resolveTenantContext(db, SEED.manager.id);
  await approveReport(db, mgr, reportId);
  expect((await getReport(db, mgr, reportId)).status).toBe("APPROVED");
});

test("request changes moves to REJECTED with a reason", async () => {
  const { db, reportId } = await makeAwaiting();
  const mgr = await resolveTenantContext(db, SEED.manager.id);
  await requestChanges(db, mgr, reportId, "Fix cement quantity");
  expect((await getReport(db, mgr, reportId)).status).toBe("REJECTED");
});

test("issue is refused when the report is not APPROVED — no PDF or issued doc created", async () => {
  const { db, reportId } = await makeAwaiting(); // report is AWAITING_REVIEW, not APPROVED
  const mgr = await resolveTenantContext(db, SEED.manager.id);
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  // Guard fires before any render/store/insert, so no Chromium launch and no orphan doc.
  await expect(issueReport(db, storage, mgr, reportId)).rejects.toThrow(/illegal transition/i);
  expect(await latestIssued(db, mgr, reportId)).toBeNull();
  expect((await getReport(db, mgr, reportId)).status).toBe("AWAITING_REVIEW");
});
