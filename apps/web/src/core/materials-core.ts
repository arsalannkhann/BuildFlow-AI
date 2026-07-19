import type { AppDb } from "@buildflow/db/client";
import type { StoragePort } from "@buildflow/storage/port";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { newId } from "@buildflow/domain/ids";
import { cmpDecimal, isDecimalString, normalizeDecimal } from "@buildflow/domain/decimal";
import {
  addMaterial, addReceipt, addReceiptLine, addStockTransaction, addSupplier,
  getMaterial, getReceipt, getReceiptLine, linkProjectSupplier, listMaterials,
  listReceiptLines, removeReceiptLine, stockLevels, updateMaterial, updateReceipt,
  updateReceiptLine,
} from "@buildflow/db/queries/materials";
import { audit } from "@buildflow/db/queries/audit";
import { emitShortageIfBelow } from "@/core/notifications-core";
import { enqueueJob } from "@buildflow/jobs/queue";
import { drainJobs } from "@buildflow/jobs/runner";
import { pipelineJobRegistry, DOCUMENT_EXTRACT_JOB } from "@buildflow/pipeline/jobs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const assertDate = (v: string | null | undefined, label: string) => {
  if (v != null && v !== "" && !DATE_RE.test(v)) throw new Error(`${label} must be YYYY-MM-DD`);
};
const assertQuantity = (v: string, label: string) => {
  if (!isDecimalString(v)) throw new Error(`${label} must be a decimal number`);
};

const inlineJobs = () => (process.env.JOBS_MODE ?? "inline") !== "worker";

// --- catalogue ---

export async function createMaterial(db: AppDb, ctx: TenantContext, input: {
  name: string; unit: string; hsnCode?: string | null; reorderThreshold?: string | null;
}): Promise<string> {
  assertCan(ctx, "material.manage");
  if (!input.name?.trim()) throw new Error("Name is required");
  if (!input.unit?.trim()) throw new Error("Unit is required");
  if (input.reorderThreshold) assertQuantity(input.reorderThreshold, "Reorder threshold");
  const row = await addMaterial(db, ctx, {
    name: input.name.trim(), unit: input.unit.trim(),
    hsnCode: input.hsnCode ?? null,
    reorderThreshold: input.reorderThreshold ? normalizeDecimal(input.reorderThreshold) : null,
  });
  await audit(db, ctx, { action: "material.created", subjectRef: row.id, metadata: { unit: row.unit } });
  return row.id;
}

export async function updateMaterialDetails(db: AppDb, ctx: TenantContext, materialId: string, patch: {
  reorderThreshold?: string | null; isActive?: boolean;
}): Promise<void> {
  assertCan(ctx, "material.manage");
  if (!(await getMaterial(db, ctx, materialId))) throw new Error("Material not found");
  if (patch.reorderThreshold) assertQuantity(patch.reorderThreshold, "Reorder threshold");
  await updateMaterial(db, ctx, materialId, {
    ...(patch.reorderThreshold !== undefined
      ? { reorderThreshold: patch.reorderThreshold ? normalizeDecimal(patch.reorderThreshold) : null }
      : {}),
    ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
  });
  await audit(db, ctx, { action: "material.updated", subjectRef: materialId, metadata: { fields: Object.keys(patch) } });
}

export async function createSupplier(db: AppDb, ctx: TenantContext, input: {
  name: string; gstin?: string | null; phone?: string | null; email?: string | null; address?: string | null;
  projectId?: string | null;
}): Promise<string> {
  assertCan(ctx, "material.manage");
  if (!input.name?.trim()) throw new Error("Name is required");
  const row = await addSupplier(db, ctx, { ...input, name: input.name.trim() });
  if (input.projectId) await linkProjectSupplier(db, ctx, { projectId: input.projectId, supplierId: row.id });
  await audit(db, ctx, { action: "supplier.created", subjectRef: row.id, metadata: {} });
  return row.id;
}

// --- receipts: challan photo -> OCR draft -> human review -> post (stock) ---

export async function createReceipt(db: AppDb, storage: StoragePort, ctx: TenantContext, input: {
  projectId: string; receiptDate: string; supplierId?: string | null; challanNumber?: string | null;
  note?: string | null;
  photo?: { bytes: Uint8Array; fileName: string; contentType: string };
}): Promise<string> {
  assertCan(ctx, "material.manage");
  if (!DATE_RE.test(input.receiptDate)) throw new Error("Receipt date must be YYYY-MM-DD");

  // Object writes use opaque immutable keys, so orphans from a rolled-back transaction are
  // harmless; the receipt row + extraction job commit atomically (transactional outbox).
  const receiptId = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    let file;
    if (input.photo) {
      const objectKey = `org/${ctx.organizationId}/challan/${newId()}`;
      const meta = await storage.put(objectKey, input.photo.bytes, input.photo.contentType);
      file = {
        objectKey, fileName: input.photo.fileName, contentType: input.photo.contentType,
        byteSize: meta.byteSize, checksum: meta.checksum,
      };
    }
    const receipt = await addReceipt(tx, ctx, {
      projectId: input.projectId, receiptDate: input.receiptDate,
      supplierId: input.supplierId ?? null, challanNumber: input.challanNumber ?? null,
      note: input.note ?? null, file, ocrStatus: file ? "queued" : null,
    });
    if (file) {
      await enqueueJob(tx, {
        organizationId: ctx.organizationId,
        kind: DOCUMENT_EXTRACT_JOB,
        payload: {
          documentKind: "challan", receiptId: receipt.id,
          projectId: input.projectId, userId: ctx.userId,
        },
        idempotencyKey: `${DOCUMENT_EXTRACT_JOB}:challan:${receipt.id}`,
      });
    }
    await audit(tx, ctx, { action: "material.receipt_created", subjectRef: receipt.id, metadata: { hasPhoto: Boolean(file) } });
    return receipt.id;
  });

  if (inlineJobs()) await drainJobs(db, pipelineJobRegistry);
  return receiptId;
}

const assertEditableReceipt = async (db: AppDb, ctx: TenantContext, receiptId: string) => {
  const receipt = await getReceipt(db, ctx, receiptId);
  if (!receipt) throw new Error("Receipt not found");
  if (receipt.status === "posted") throw new Error("A posted receipt is append-only; record an adjustment instead");
  return receipt;
};

export async function addManualReceiptLine(db: AppDb, ctx: TenantContext, input: {
  receiptId: string; descriptionRaw: string; quantity: string; unit: string;
  materialId?: string | null; ratePaise?: number | null; amountPaise?: number | null;
}): Promise<void> {
  assertCan(ctx, "material.manage");
  await assertEditableReceipt(db, ctx, input.receiptId);
  if (!input.descriptionRaw?.trim()) throw new Error("Description is required");
  assertQuantity(input.quantity, "Quantity");
  if (!input.unit?.trim()) throw new Error("Unit is required");
  await addReceiptLine(db, ctx, {
    receiptId: input.receiptId, descriptionRaw: input.descriptionRaw.trim(),
    quantity: normalizeDecimal(input.quantity), unit: input.unit.trim(),
    materialId: input.materialId ?? null,
    ratePaise: input.ratePaise ?? null, amountPaise: input.amountPaise ?? null,
  });
}

export async function editReceiptLine(db: AppDb, ctx: TenantContext, lineId: string, patch: {
  materialId?: string | null; quantity?: string; unit?: string; descriptionRaw?: string;
}): Promise<void> {
  assertCan(ctx, "material.manage");
  const line = await getReceiptLine(db, ctx, lineId);
  if (!line) throw new Error("Receipt line not found");
  await assertEditableReceipt(db, ctx, line.receiptId);
  if (patch.quantity !== undefined) assertQuantity(patch.quantity, "Quantity");
  if (patch.materialId) {
    if (!(await getMaterial(db, ctx, patch.materialId))) throw new Error("Material not found");
  }
  await updateReceiptLine(db, ctx, lineId, {
    ...(patch.materialId !== undefined ? { materialId: patch.materialId || null } : {}),
    ...(patch.quantity !== undefined ? { quantity: normalizeDecimal(patch.quantity) } : {}),
    ...(patch.unit !== undefined ? { unit: patch.unit.trim() } : {}),
    ...(patch.descriptionRaw !== undefined ? { descriptionRaw: patch.descriptionRaw.trim() } : {}),
  });
}

export async function deleteReceiptLine(db: AppDb, ctx: TenantContext, lineId: string): Promise<void> {
  assertCan(ctx, "material.manage");
  const line = await getReceiptLine(db, ctx, lineId);
  if (!line) throw new Error("Receipt line not found");
  await assertEditableReceipt(db, ctx, line.receiptId);
  await removeReceiptLine(db, ctx, lineId);
}

// Human review gate (material.review): every line must be mapped to a catalogue material
// with a positive quantity and a unit before the receipt can move forward. OCR confidence
// never bypasses this step (rules.md §11).
export async function markReceiptReviewed(db: AppDb, ctx: TenantContext, receiptId: string): Promise<void> {
  assertCan(ctx, "material.review");
  const receipt = await getReceipt(db, ctx, receiptId);
  if (!receipt) throw new Error("Receipt not found");
  if (receipt.status === "reviewed") return;
  if (receipt.status !== "draft") throw new Error("Only draft receipts can be reviewed");
  const lines = await listReceiptLines(db, ctx, receiptId);
  if (lines.length === 0) throw new Error("Add at least one line before review");
  for (const line of lines) {
    if (!line.materialId) throw new Error(`Line "${line.descriptionRaw}" must be mapped to a material`);
    if (!(await getMaterial(db, ctx, line.materialId))) throw new Error("Mapped material not found");
    if (!line.unit.trim()) throw new Error(`Line "${line.descriptionRaw}" needs a unit`);
    if (cmpDecimal(line.quantity, "0") <= 0) throw new Error(`Line "${line.descriptionRaw}" needs a positive quantity`);
  }
  await updateReceipt(db, ctx, receiptId, { status: "reviewed", reviewedBy: ctx.userId, reviewedAt: new Date() });
  await audit(db, ctx, { action: "material.receipt_reviewed", subjectRef: receiptId, metadata: { lines: lines.length } });
}

// Posting applies stock EXACTLY ONCE: the ledger insert and the status flip share one
// transaction, and each ledger row carries (source_kind='receipt_line', source_id=line.id)
// under a unique index — a crash-retry re-runs the inserts as no-ops.
export async function postReceipt(db: AppDb, ctx: TenantContext, receiptId: string): Promise<void> {
  assertCan(ctx, "material.review");
  const receipt = await getReceipt(db, ctx, receiptId);
  if (!receipt) throw new Error("Receipt not found");
  if (receipt.status === "posted") return; // idempotent
  if (receipt.status !== "reviewed") throw new Error("A receipt must be reviewed before posting");
  const lines = await listReceiptLines(db, ctx, receiptId);
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    for (const line of lines) {
      if (!line.materialId) throw new Error("Every line must be mapped to a material");
      await addStockTransaction(tx, ctx, {
        projectId: receipt.projectId, materialId: line.materialId, kind: "received",
        quantity: line.quantity, unit: line.unit,
        sourceKind: "receipt_line", sourceId: line.id,
        note: receipt.challanNumber ? `Challan ${receipt.challanNumber}` : null,
      });
    }
    await updateReceipt(tx, ctx, receiptId, { status: "posted", postedBy: ctx.userId, postedAt: new Date() });
    await audit(tx, ctx, { action: "material.receipt_posted", subjectRef: receiptId, metadata: { lines: lines.length } });
  });
}

// Manual ledger movements (issue to works, consumption, count adjustment, return).
export async function recordStockMovement(db: AppDb, ctx: TenantContext, input: {
  projectId: string; materialId: string; kind: string; quantity: string; note?: string | null;
}): Promise<void> {
  assertCan(ctx, "material.manage");
  if (!["received", "issued", "consumed", "adjusted", "returned"].includes(input.kind)) {
    throw new Error("Unknown stock movement kind");
  }
  assertQuantity(input.quantity, "Quantity");
  const quantity = normalizeDecimal(input.quantity);
  if (input.kind !== "adjusted" && cmpDecimal(quantity, "0") <= 0) {
    throw new Error("Quantity must be positive (use an adjustment for signed corrections)");
  }
  const material = await getMaterial(db, ctx, input.materialId);
  if (!material) throw new Error("Material not found");
  await addStockTransaction(db, ctx, {
    projectId: input.projectId, materialId: input.materialId, kind: input.kind,
    quantity, unit: material.unit, sourceKind: "manual", note: input.note ?? null,
  });
  await audit(db, ctx, { action: "material.stock_recorded", subjectRef: input.materialId, metadata: { kind: input.kind, quantity } });
  // Phase E1 hook: deterministic shortage detection after outgoing/adjusting movements.
  if (["issued", "consumed", "adjusted"].includes(input.kind)) {
    await emitShortageIfBelow(db, ctx, input.projectId, input.materialId);
  }
}

// --- deterministic shortage alerts (project overview) ---

export type ShortageAlert = {
  materialId: string; name: string; unit: string;
  currentStock: string; reorderThreshold: string;
};

/** current stock < reorder_threshold, from the ledger sum only. No prediction. */
export async function shortageAlerts(db: AppDb, ctx: TenantContext, projectId: string): Promise<ShortageAlert[]> {
  assertCan(ctx, "project.read");
  const [catalogue, levels] = await Promise.all([listMaterials(db, ctx), stockLevels(db, ctx, projectId)]);
  const levelByMaterial = new Map(levels.map((l) => [l.materialId, l.currentStock]));
  const alerts: ShortageAlert[] = [];
  for (const material of catalogue) {
    if (!material.isActive || material.reorderThreshold == null) continue;
    const currentStock = levelByMaterial.get(material.id) ?? "0";
    if (cmpDecimal(currentStock, material.reorderThreshold) < 0) {
      alerts.push({
        materialId: material.id, name: material.name, unit: material.unit,
        currentStock: normalizeDecimal(currentStock), reorderThreshold: material.reorderThreshold,
      });
    }
  }
  return alerts;
}
