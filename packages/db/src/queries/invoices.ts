import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { costEntries, invoiceLines, invoices, payments } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type CostEntry = typeof costEntries.$inferSelect;
export type Payment = typeof payments.$inferSelect;

const org = (ctx: TenantContext) => ctx.organizationId;
const asInt = (v: string | null | undefined): number => Number(v ?? 0);

// --- invoices ---

export async function addInvoice(db: AppDb, ctx: TenantContext, input: {
  projectId: string; supplierId?: string | null; invoiceNumber?: string | null;
  invoiceDate?: string | null; gstin?: string | null;
  subtotalPaise?: number | null; taxPaise?: number | null; totalPaise?: number | null;
  file?: { objectKey: string; fileName: string; contentType: string; byteSize: number; checksum: string };
  ocrStatus?: string | null;
}): Promise<Invoice> {
  const [row] = await db.insert(invoices).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    supplierId: input.supplierId ?? null, invoiceNumber: input.invoiceNumber ?? null,
    invoiceDate: input.invoiceDate ?? null, gstin: input.gstin ?? null,
    subtotalPaise: input.subtotalPaise ?? null, taxPaise: input.taxPaise ?? null,
    totalPaise: input.totalPaise ?? null,
    objectKey: input.file?.objectKey ?? null, fileName: input.file?.fileName ?? null,
    contentType: input.file?.contentType ?? null, byteSize: input.file?.byteSize ?? null,
    checksum: input.file?.checksum ?? null,
    ocrStatus: input.ocrStatus ?? null, createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function getInvoice(db: AppDb, ctx: TenantContext, id: string): Promise<Invoice | null> {
  const [row] = await db.select().from(invoices)
    .where(and(eq(invoices.organizationId, org(ctx)), eq(invoices.id, id)));
  return row ?? null;
}

export async function listInvoices(
  db: AppDb, ctx: TenantContext, projectId: string, opts?: { status?: string },
): Promise<Invoice[]> {
  return db.select().from(invoices).where(and(
    eq(invoices.organizationId, org(ctx)), eq(invoices.projectId, projectId),
    opts?.status ? eq(invoices.status, opts.status) : undefined,
  )).orderBy(desc(invoices.createdAt));
}

export async function updateInvoice(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  supplierId: string | null; invoiceNumber: string | null; invoiceDate: string | null;
  gstin: string | null; subtotalPaise: number | null; taxPaise: number | null; totalPaise: number | null;
  status: string; ocrProvider: string | null; ocrModel: string | null; ocrSchemaVersion: string | null;
  ocrStatus: string | null; reviewedBy: string | null; reviewedAt: Date | null;
  approvedBy: string | null; approvedAt: Date | null;
}>): Promise<void> {
  await db.update(invoices).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(invoices.organizationId, org(ctx)), eq(invoices.id, id)));
}

export async function addInvoiceLine(db: AppDb, ctx: TenantContext, input: {
  invoiceId: string; description: string; hsn?: string | null; quantity?: string | null;
  unit?: string | null; ratePaise?: number | null; taxRateBp?: number | null;
  amountPaise?: number | null; costCodeId?: string | null; confidenceBand?: string | null;
  sortOrder?: number;
}): Promise<InvoiceLine> {
  const [row] = await db.insert(invoiceLines).values({
    id: newId(), organizationId: org(ctx), invoiceId: input.invoiceId,
    description: input.description, hsn: input.hsn ?? null,
    quantity: input.quantity ?? null, unit: input.unit ?? null,
    ratePaise: input.ratePaise ?? null, taxRateBp: input.taxRateBp ?? null,
    amountPaise: input.amountPaise ?? null, costCodeId: input.costCodeId ?? null,
    confidenceBand: input.confidenceBand ?? null, sortOrder: input.sortOrder ?? 0,
  }).returning();
  return row;
}

export async function getInvoiceLine(db: AppDb, ctx: TenantContext, id: string): Promise<InvoiceLine | null> {
  const [row] = await db.select().from(invoiceLines)
    .where(and(eq(invoiceLines.organizationId, org(ctx)), eq(invoiceLines.id, id)));
  return row ?? null;
}

export async function listInvoiceLines(db: AppDb, ctx: TenantContext, invoiceId: string): Promise<InvoiceLine[]> {
  return db.select().from(invoiceLines)
    .where(and(eq(invoiceLines.organizationId, org(ctx)), eq(invoiceLines.invoiceId, invoiceId)))
    .orderBy(asc(invoiceLines.sortOrder), asc(invoiceLines.createdAt));
}

export async function updateInvoiceLine(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  description: string; quantity: string | null; unit: string | null; ratePaise: number | null;
  taxRateBp: number | null; amountPaise: number | null; costCodeId: string | null;
}>): Promise<void> {
  await db.update(invoiceLines).set(patch)
    .where(and(eq(invoiceLines.organizationId, org(ctx)), eq(invoiceLines.id, id)));
}

export async function removeInvoiceLine(db: AppDb, ctx: TenantContext, id: string): Promise<void> {
  await db.delete(invoiceLines)
    .where(and(eq(invoiceLines.organizationId, org(ctx)), eq(invoiceLines.id, id)));
}

// --- append-only cost entries ---

/**
 * Inserts one actuals row. With sourceKind/sourceId set, the partial unique index makes
 * replays no-ops — approving an invoice twice posts costs exactly once.
 */
export async function addCostEntry(db: AppDb, ctx: TenantContext, input: {
  projectId: string; kind: string; amountPaise: number; entryDate: string;
  costCodeId?: string | null; sourceKind?: string | null; sourceId?: string | null; note?: string | null;
}): Promise<void> {
  await db.insert(costEntries).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    costCodeId: input.costCodeId ?? null, kind: input.kind, amountPaise: input.amountPaise,
    sourceKind: input.sourceKind ?? null, sourceId: input.sourceId ?? null,
    entryDate: input.entryDate, note: input.note ?? null, createdBy: ctx.userId,
  }).onConflictDoNothing();
}

export async function listCostEntries(db: AppDb, ctx: TenantContext, projectId: string): Promise<CostEntry[]> {
  return db.select().from(costEntries)
    .where(and(eq(costEntries.organizationId, org(ctx)), eq(costEntries.projectId, projectId)))
    .orderBy(desc(costEntries.entryDate), desc(costEntries.createdAt));
}

export type CostByCode = { costCodeId: string | null; actualPaise: number };

export async function actualsByCostCode(db: AppDb, ctx: TenantContext, projectId: string): Promise<CostByCode[]> {
  const rows = await db.select({
    costCodeId: costEntries.costCodeId,
    actual: sql<string>`coalesce(sum(${costEntries.amountPaise}), 0)::text`,
  }).from(costEntries)
    .where(and(eq(costEntries.organizationId, org(ctx)), eq(costEntries.projectId, projectId)))
    .groupBy(costEntries.costCodeId);
  return rows.map((r) => ({ costCodeId: r.costCodeId, actualPaise: asInt(r.actual) }));
}

/** Sum of approved invoice totals (falls back to line sums where a total was not entered). */
export async function invoicedTotalPaise(db: AppDb, ctx: TenantContext, projectId: string): Promise<number> {
  const [row] = await db.select({
    total: sql<string>`coalesce(sum(coalesce(${invoices.totalPaise}, ${invoices.subtotalPaise}, 0)), 0)::text`,
  }).from(invoices).where(and(
    eq(invoices.organizationId, org(ctx)), eq(invoices.projectId, projectId),
    eq(invoices.status, "approved"),
  ));
  return asInt(row?.total);
}

// --- payments (recorded, never executed) ---

export async function addPayment(db: AppDb, ctx: TenantContext, input: {
  projectId: string; invoiceId: string; amountPaise: number; paidDate: string; reference?: string | null;
}): Promise<Payment> {
  const [row] = await db.insert(payments).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId, invoiceId: input.invoiceId,
    amountPaise: input.amountPaise, paidDate: input.paidDate,
    reference: input.reference ?? null, createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function listPayments(db: AppDb, ctx: TenantContext, projectId: string): Promise<Payment[]> {
  return db.select().from(payments)
    .where(and(eq(payments.organizationId, org(ctx)), eq(payments.projectId, projectId)))
    .orderBy(desc(payments.paidDate));
}

export async function paidTotalPaise(db: AppDb, ctx: TenantContext, projectId: string): Promise<number> {
  const [row] = await db.select({
    total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)::text`,
  }).from(payments)
    .where(and(eq(payments.organizationId, org(ctx)), eq(payments.projectId, projectId)));
  return asInt(row?.total);
}
