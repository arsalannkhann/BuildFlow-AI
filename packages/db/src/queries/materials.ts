import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import {
  materialReceiptLines, materialReceipts, materials, projectSuppliers, stockTransactions, suppliers,
} from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type Material = typeof materials.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type MaterialReceipt = typeof materialReceipts.$inferSelect;
export type MaterialReceiptLine = typeof materialReceiptLines.$inferSelect;
export type StockTransaction = typeof stockTransactions.$inferSelect;

const org = (ctx: TenantContext) => ctx.organizationId;

// --- catalogue ---

export async function listMaterials(db: AppDb, ctx: TenantContext): Promise<Material[]> {
  return db.select().from(materials)
    .where(eq(materials.organizationId, org(ctx)))
    .orderBy(asc(materials.name));
}

export async function getMaterial(db: AppDb, ctx: TenantContext, id: string): Promise<Material | null> {
  const [row] = await db.select().from(materials)
    .where(and(eq(materials.organizationId, org(ctx)), eq(materials.id, id)));
  return row ?? null;
}

export async function addMaterial(db: AppDb, ctx: TenantContext, input: {
  name: string; unit: string; hsnCode?: string | null; reorderThreshold?: string | null;
}): Promise<Material> {
  const [row] = await db.insert(materials).values({
    id: newId(), organizationId: org(ctx), name: input.name, unit: input.unit,
    hsnCode: input.hsnCode ?? null, reorderThreshold: input.reorderThreshold ?? null,
  }).returning();
  return row;
}

export async function updateMaterial(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  name: string; unit: string; hsnCode: string | null; reorderThreshold: string | null; isActive: boolean;
}>): Promise<void> {
  await db.update(materials).set(patch)
    .where(and(eq(materials.organizationId, org(ctx)), eq(materials.id, id)));
}

// --- suppliers ---

export async function listSuppliers(db: AppDb, ctx: TenantContext): Promise<Supplier[]> {
  return db.select().from(suppliers)
    .where(eq(suppliers.organizationId, org(ctx)))
    .orderBy(asc(suppliers.name));
}

export async function getSupplier(db: AppDb, ctx: TenantContext, id: string): Promise<Supplier | null> {
  const [row] = await db.select().from(suppliers)
    .where(and(eq(suppliers.organizationId, org(ctx)), eq(suppliers.id, id)));
  return row ?? null;
}

export async function addSupplier(db: AppDb, ctx: TenantContext, input: {
  name: string; gstin?: string | null; phone?: string | null; email?: string | null; address?: string | null;
}): Promise<Supplier> {
  const [row] = await db.insert(suppliers).values({
    id: newId(), organizationId: org(ctx), name: input.name, gstin: input.gstin ?? null,
    phone: input.phone ?? null, email: input.email ?? null, address: input.address ?? null,
  }).returning();
  return row;
}

export async function linkProjectSupplier(db: AppDb, ctx: TenantContext, input: {
  projectId: string; supplierId: string; notes?: string | null;
}): Promise<void> {
  await db.insert(projectSuppliers).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    supplierId: input.supplierId, notes: input.notes ?? null,
  }).onConflictDoNothing();
}

export async function listProjectSuppliers(db: AppDb, ctx: TenantContext, projectId: string) {
  return db.select().from(projectSuppliers)
    .where(and(eq(projectSuppliers.organizationId, org(ctx)), eq(projectSuppliers.projectId, projectId)))
    .orderBy(asc(projectSuppliers.createdAt));
}

// --- receipts (challans) ---

export async function addReceipt(db: AppDb, ctx: TenantContext, input: {
  projectId: string; receiptDate: string; supplierId?: string | null; challanNumber?: string | null;
  note?: string | null;
  file?: { objectKey: string; fileName: string; contentType: string; byteSize: number; checksum: string };
  ocrStatus?: string | null;
}): Promise<MaterialReceipt> {
  const [row] = await db.insert(materialReceipts).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    receiptDate: input.receiptDate, supplierId: input.supplierId ?? null,
    challanNumber: input.challanNumber ?? null, note: input.note ?? null,
    objectKey: input.file?.objectKey ?? null, fileName: input.file?.fileName ?? null,
    contentType: input.file?.contentType ?? null, byteSize: input.file?.byteSize ?? null,
    checksum: input.file?.checksum ?? null,
    ocrStatus: input.ocrStatus ?? null, createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function getReceipt(db: AppDb, ctx: TenantContext, id: string): Promise<MaterialReceipt | null> {
  const [row] = await db.select().from(materialReceipts)
    .where(and(eq(materialReceipts.organizationId, org(ctx)), eq(materialReceipts.id, id)));
  return row ?? null;
}

export async function listReceipts(
  db: AppDb, ctx: TenantContext, projectId: string, opts?: { status?: string },
): Promise<MaterialReceipt[]> {
  return db.select().from(materialReceipts).where(and(
    eq(materialReceipts.organizationId, org(ctx)), eq(materialReceipts.projectId, projectId),
    opts?.status ? eq(materialReceipts.status, opts.status) : undefined,
  )).orderBy(desc(materialReceipts.receiptDate), desc(materialReceipts.createdAt));
}

export async function updateReceipt(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  supplierId: string | null; challanNumber: string | null; receiptDate: string; note: string | null;
  status: string; ocrProvider: string | null; ocrModel: string | null; ocrSchemaVersion: string | null;
  ocrStatus: string | null; reviewedBy: string | null; reviewedAt: Date | null;
  postedBy: string | null; postedAt: Date | null;
}>): Promise<void> {
  await db.update(materialReceipts).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(materialReceipts.organizationId, org(ctx)), eq(materialReceipts.id, id)));
}

export async function addReceiptLine(db: AppDb, ctx: TenantContext, input: {
  receiptId: string; materialId?: string | null; descriptionRaw: string; quantity: string; unit: string;
  ratePaise?: number | null; amountPaise?: number | null; confidenceBand?: string | null; sortOrder?: number;
}): Promise<MaterialReceiptLine> {
  const [row] = await db.insert(materialReceiptLines).values({
    id: newId(), organizationId: org(ctx), receiptId: input.receiptId,
    materialId: input.materialId ?? null, descriptionRaw: input.descriptionRaw,
    quantity: input.quantity, unit: input.unit,
    ratePaise: input.ratePaise ?? null, amountPaise: input.amountPaise ?? null,
    confidenceBand: input.confidenceBand ?? null, sortOrder: input.sortOrder ?? 0,
  }).returning();
  return row;
}

export async function getReceiptLine(db: AppDb, ctx: TenantContext, id: string): Promise<MaterialReceiptLine | null> {
  const [row] = await db.select().from(materialReceiptLines)
    .where(and(eq(materialReceiptLines.organizationId, org(ctx)), eq(materialReceiptLines.id, id)));
  return row ?? null;
}

export async function listReceiptLines(db: AppDb, ctx: TenantContext, receiptId: string): Promise<MaterialReceiptLine[]> {
  return db.select().from(materialReceiptLines)
    .where(and(eq(materialReceiptLines.organizationId, org(ctx)), eq(materialReceiptLines.receiptId, receiptId)))
    .orderBy(asc(materialReceiptLines.sortOrder), asc(materialReceiptLines.createdAt));
}

export async function updateReceiptLine(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  materialId: string | null; descriptionRaw: string; quantity: string; unit: string;
  ratePaise: number | null; amountPaise: number | null;
}>): Promise<void> {
  await db.update(materialReceiptLines).set(patch)
    .where(and(eq(materialReceiptLines.organizationId, org(ctx)), eq(materialReceiptLines.id, id)));
}

export async function removeReceiptLine(db: AppDb, ctx: TenantContext, id: string): Promise<void> {
  await db.delete(materialReceiptLines)
    .where(and(eq(materialReceiptLines.organizationId, org(ctx)), eq(materialReceiptLines.id, id)));
}

// --- append-only stock ledger ---

/**
 * Inserts one ledger row. When sourceKind/sourceId are set, the partial unique index
 * (source_kind, source_id) makes replays no-ops — exactly-once stock application.
 */
export async function addStockTransaction(db: AppDb, ctx: TenantContext, input: {
  projectId: string; materialId: string; kind: string; quantity: string; unit: string;
  sourceKind?: string | null; sourceId?: string | null; note?: string | null;
}): Promise<void> {
  await db.insert(stockTransactions).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    materialId: input.materialId, kind: input.kind, quantity: input.quantity, unit: input.unit,
    sourceKind: input.sourceKind ?? null, sourceId: input.sourceId ?? null,
    note: input.note ?? null, createdBy: ctx.userId,
  }).onConflictDoNothing();
}

/** Ledger rows for one material, newest first, with the source receipt (if any) joined. */
export async function stockLedger(
  db: AppDb, ctx: TenantContext, projectId: string, materialId: string,
): Promise<(StockTransaction & { receiptId: string | null })[]> {
  const rows = await db.select({
    tx: stockTransactions,
    receiptId: materialReceiptLines.receiptId,
  }).from(stockTransactions)
    .leftJoin(materialReceiptLines, and(
      eq(stockTransactions.sourceKind, "receipt_line"),
      eq(stockTransactions.sourceId, materialReceiptLines.id),
    ))
    .where(and(
      eq(stockTransactions.organizationId, org(ctx)),
      eq(stockTransactions.projectId, projectId),
      eq(stockTransactions.materialId, materialId),
    ))
    .orderBy(desc(stockTransactions.createdAt));
  return rows.map((r) => ({ ...r.tx, receiptId: r.receiptId ?? null }));
}

// Sign is derived from kind at read time: received/returned add, issued/consumed subtract,
// adjusted is signed as entered. Current stock is ALWAYS this sum — never a stored level.
const SIGNED_QTY = sql<string>`sum(case
  when ${stockTransactions.kind} in ('received', 'returned') then ${stockTransactions.quantity}
  when ${stockTransactions.kind} in ('issued', 'consumed') then -${stockTransactions.quantity}
  else ${stockTransactions.quantity} end)::text`;

export type StockLevel = { materialId: string; currentStock: string };

export async function stockLevels(db: AppDb, ctx: TenantContext, projectId: string): Promise<StockLevel[]> {
  const rows = await db.select({
    materialId: stockTransactions.materialId,
    currentStock: SIGNED_QTY,
  }).from(stockTransactions)
    .where(and(eq(stockTransactions.organizationId, org(ctx)), eq(stockTransactions.projectId, projectId)))
    .groupBy(stockTransactions.materialId);
  return rows.map((r) => ({ materialId: r.materialId, currentStock: r.currentStock ?? "0" }));
}
