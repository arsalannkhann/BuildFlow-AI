import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@/db/client";
import { seed, SEED } from "@/db/seed";
import { submitReport } from "./capture-core";
import { approveReport, requestChanges } from "./review-core";
import { getReport } from "@/db/queries/reports";
import { LocalFsStorage } from "@/storage/local-fs";
import { contextForUser } from "@/app/session";

async function makeAwaiting() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-rev-"));
  const db = await createTestDb();
  await seed(db);
  const eng = contextForUser(SEED.engineer.id);
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  const reportId = await submitReport(db, storage, eng, {
    reportDate: "2026-07-13", audio: { bytes: new TextEncoder().encode("a"), contentType: "audio/webm" }, photos: [] });
  return { db, reportId };
}

test("engineer without approve capability is denied", async () => {
  const { db, reportId } = await makeAwaiting();
  const eng = contextForUser(SEED.engineer.id);
  await expect(approveReport(db, eng, reportId)).rejects.toThrow(/not permitted/i);
});

test("manager approves; report becomes APPROVED", async () => {
  const { db, reportId } = await makeAwaiting();
  const mgr = contextForUser(SEED.manager.id);
  await approveReport(db, mgr, reportId);
  expect((await getReport(db, mgr, reportId)).status).toBe("APPROVED");
});

test("request changes moves to REJECTED with a reason", async () => {
  const { db, reportId } = await makeAwaiting();
  const mgr = contextForUser(SEED.manager.id);
  await requestChanges(db, mgr, reportId, "Fix cement quantity");
  expect((await getReport(db, mgr, reportId)).status).toBe("REJECTED");
});
