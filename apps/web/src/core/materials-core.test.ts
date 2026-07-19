import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { getMaterial, getReceipt, listReceiptLines, stockLevels } from "@buildflow/db/queries/materials";
import {
  addManualReceiptLine, createMaterial, createReceipt, deleteReceiptLine, editReceiptLine,
  markReceiptReviewed, postReceipt, recordStockMovement, shortageAlerts,
} from "./materials-core";

async function setup() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-mat-"));
  const db = await createTestDb();
  await seed(db);
  const eng = await resolveTenantContext(db, SEED.engineer.id); // material.manage, no material.review
  const mgr = await resolveTenantContext(db, SEED.manager.id); // material.review, no material.manage
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  return { db, eng, mgr, storage };
}

const photo = { bytes: new TextEncoder().encode("challan-photo"), fileName: "challan.jpg", contentType: "image/jpeg" };

test("challan photo -> OCR draft -> human review -> post applies stock exactly once", async () => {
  const { db, eng, mgr, storage } = await setup();
  const cementId = await createMaterial(db, eng, { name: "OPC 43 Cement", unit: "bag", reorderThreshold: "100" });

  const receiptId = await createReceipt(db, storage, eng, {
    projectId: SEED.projectId, receiptDate: "2026-07-18", photo,
  });

  // OCR (mock, deterministic) landed DRAFT lines with confidence bands — and nothing else.
  const receipt = await getReceipt(db, mgr, receiptId);
  expect(receipt?.status).toBe("draft");
  expect(receipt?.ocrStatus).toBe("succeeded");
  expect(receipt?.ocrProvider).toBe("mock");
  expect(receipt?.ocrSchemaVersion).toBe("challan.v1");
  expect(receipt?.challanNumber).toBe("CH-2041");
  const lines = await listReceiptLines(db, mgr, receiptId);
  expect(lines.length).toBe(2);
  expect(lines[0].confidenceBand).toBe("Supported");
  expect(lines[0].quantity).toBe("50");
  expect(await stockLevels(db, mgr, SEED.projectId)).toEqual([]); // OCR never touches stock

  // Review requires every line mapped to a catalogue material.
  await expect(markReceiptReviewed(db, mgr, receiptId)).rejects.toThrow(/mapped to a material/i);
  await editReceiptLine(db, eng, lines[0].id, { materialId: cementId });
  await deleteReceiptLine(db, eng, lines[1].id); // sand not in catalogue for this test
  await markReceiptReviewed(db, mgr, receiptId);
  expect((await getReceipt(db, mgr, receiptId))?.status).toBe("reviewed");

  await postReceipt(db, mgr, receiptId);
  const levels = await stockLevels(db, mgr, SEED.projectId);
  expect(levels).toEqual([{ materialId: cementId, currentStock: "50" }]);

  // Posting again (retry) applies stock exactly once.
  await postReceipt(db, mgr, receiptId);
  expect(await stockLevels(db, mgr, SEED.projectId)).toEqual([{ materialId: cementId, currentStock: "50" }]);
  expect((await getReceipt(db, mgr, receiptId))?.status).toBe("posted");
});

test("capability gates: manage vs review are separate people", async () => {
  const { db, eng, mgr, storage } = await setup();
  await expect(createMaterial(db, mgr, { name: "Sand", unit: "cum" })).rejects.toThrow(/not permitted/i);

  const cementId = await createMaterial(db, eng, { name: "Cement", unit: "bag" });
  const receiptId = await createReceipt(db, storage, eng, {
    projectId: SEED.projectId, receiptDate: "2026-07-18",
  });
  await addManualReceiptLine(db, eng, {
    receiptId, descriptionRaw: "Cement 50kg", quantity: "10", unit: "bag", materialId: cementId,
  });
  // Engineer (creator) cannot review or post; posting requires prior review.
  await expect(markReceiptReviewed(db, eng, receiptId)).rejects.toThrow(/not permitted/i);
  await expect(postReceipt(db, eng, receiptId)).rejects.toThrow(/not permitted/i);
  await expect(postReceipt(db, mgr, receiptId)).rejects.toThrow(/reviewed before posting/i);
});

test("shortage alerts are deterministic ledger sums vs reorder threshold", async () => {
  const { db, eng, mgr } = await setup();
  const cementId = await createMaterial(db, eng, { name: "Cement", unit: "bag", reorderThreshold: "100" });

  await recordStockMovement(db, eng, { projectId: SEED.projectId, materialId: cementId, kind: "received", quantity: "50" });
  let alerts = await shortageAlerts(db, mgr, SEED.projectId);
  expect(alerts).toEqual([{
    materialId: cementId, name: "Cement", unit: "bag", currentStock: "50", reorderThreshold: "100",
  }]);

  await recordStockMovement(db, eng, { projectId: SEED.projectId, materialId: cementId, kind: "received", quantity: "60" });
  expect(await shortageAlerts(db, mgr, SEED.projectId)).toEqual([]); // 110 >= 100

  await recordStockMovement(db, eng, { projectId: SEED.projectId, materialId: cementId, kind: "issued", quantity: "30" });
  alerts = await shortageAlerts(db, mgr, SEED.projectId);
  expect(alerts.map((a) => a.currentStock)).toEqual(["80"]); // signed sum at read time
});

test("unsupported upload falls back to manual lines; cross-tenant reads fail closed", async () => {
  const { db, eng, mgr, storage } = await setup();
  const receiptId = await createReceipt(db, storage, eng, {
    projectId: SEED.projectId, receiptDate: "2026-07-18",
    photo: { bytes: new TextEncoder().encode("%PDF"), fileName: "challan.pdf", contentType: "application/pdf" },
  });
  const receipt = await getReceipt(db, eng, receiptId);
  expect(receipt?.ocrStatus).toBe("unsupported");
  expect(await listReceiptLines(db, eng, receiptId)).toEqual([]);
  await addManualReceiptLine(db, eng, { receiptId, descriptionRaw: "Bricks", quantity: "500", unit: "nos" });
  expect((await listReceiptLines(db, eng, receiptId)).length).toBe(1);

  const foreign = { ...mgr, organizationId: "org-elsewhere" };
  expect(await getReceipt(db, foreign, receiptId)).toBeNull();
  const materialId = await createMaterial(db, eng, { name: "Cement", unit: "bag" });
  expect(await getMaterial(db, foreign, materialId)).toBeNull();
  expect(await stockLevels(db, foreign, SEED.projectId)).toEqual([]);
});
