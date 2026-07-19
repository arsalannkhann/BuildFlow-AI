import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { poLines, purchaseOrders, rfqItems, rfqQuotes, rfqs } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type Rfq = typeof rfqs.$inferSelect;
export type RfqItem = typeof rfqItems.$inferSelect;
export type RfqQuote = typeof rfqQuotes.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PoLine = typeof poLines.$inferSelect;

const org = (ctx: TenantContext) => ctx.organizationId;

// --- RFQs ---

export async function addRfq(db: AppDb, ctx: TenantContext, input: {
  projectId: string; title: string; neededBy?: string | null; note?: string | null;
}): Promise<Rfq> {
  const [row] = await db.insert(rfqs).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId, title: input.title,
    neededBy: input.neededBy ?? null, note: input.note ?? null, createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function getRfq(db: AppDb, ctx: TenantContext, id: string): Promise<Rfq | null> {
  const [row] = await db.select().from(rfqs)
    .where(and(eq(rfqs.organizationId, org(ctx)), eq(rfqs.id, id)));
  return row ?? null;
}

export async function listRfqs(db: AppDb, ctx: TenantContext, projectId: string): Promise<Rfq[]> {
  return db.select().from(rfqs)
    .where(and(eq(rfqs.organizationId, org(ctx)), eq(rfqs.projectId, projectId)))
    .orderBy(desc(rfqs.createdAt));
}

export async function setRfqStatus(db: AppDb, ctx: TenantContext, id: string, status: string): Promise<void> {
  await db.update(rfqs).set({ status })
    .where(and(eq(rfqs.organizationId, org(ctx)), eq(rfqs.id, id)));
}

export async function addRfqItem(db: AppDb, ctx: TenantContext, input: {
  rfqId: string; description: string; quantity: string; unit: string;
  materialId?: string | null; sortOrder?: number;
}): Promise<RfqItem> {
  const [row] = await db.insert(rfqItems).values({
    id: newId(), organizationId: org(ctx), rfqId: input.rfqId,
    materialId: input.materialId ?? null, description: input.description,
    quantity: input.quantity, unit: input.unit, sortOrder: input.sortOrder ?? 0,
  }).returning();
  return row;
}

export async function listRfqItems(db: AppDb, ctx: TenantContext, rfqId: string): Promise<RfqItem[]> {
  return db.select().from(rfqItems)
    .where(and(eq(rfqItems.organizationId, org(ctx)), eq(rfqItems.rfqId, rfqId)))
    .orderBy(asc(rfqItems.sortOrder), asc(rfqItems.createdAt));
}

/** Upsert one supplier's manual quote for one item (unique per item+supplier). */
export async function upsertQuote(db: AppDb, ctx: TenantContext, input: {
  rfqItemId: string; supplierId: string; ratePaise: number;
  deliveryDays?: number | null; notes?: string | null;
}): Promise<void> {
  await db.insert(rfqQuotes).values({
    id: newId(), organizationId: org(ctx), rfqItemId: input.rfqItemId,
    supplierId: input.supplierId, ratePaise: input.ratePaise,
    deliveryDays: input.deliveryDays ?? null, notes: input.notes ?? null, createdBy: ctx.userId,
  }).onConflictDoUpdate({
    target: [rfqQuotes.rfqItemId, rfqQuotes.supplierId],
    set: {
      ratePaise: input.ratePaise,
      deliveryDays: input.deliveryDays ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function listQuotesForRfq(db: AppDb, ctx: TenantContext, rfqId: string): Promise<RfqQuote[]> {
  const rows = await db.select({ quote: rfqQuotes }).from(rfqQuotes)
    .innerJoin(rfqItems, eq(rfqQuotes.rfqItemId, rfqItems.id))
    .where(and(
      eq(rfqQuotes.organizationId, org(ctx)),
      eq(rfqItems.organizationId, org(ctx)),
      eq(rfqItems.rfqId, rfqId),
    ))
    .orderBy(asc(rfqQuotes.ratePaise));
  return rows.map((r) => r.quote);
}

// --- purchase orders (draft-only workflow; NEVER sent automatically) ---

// Per-project PO number via max+1; unique index turns a race into a retryable conflict.
export async function addPurchaseOrder(db: AppDb, ctx: TenantContext, input: {
  projectId: string; supplierId: string; rfqId?: string | null; note?: string | null;
  lines: {
    description: string; quantity: string; unit: string; ratePaise: number; amountPaise: number;
    materialId?: string | null; costCodeId?: string | null;
  }[];
}): Promise<PurchaseOrder> {
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    const [{ max }] = (await tx.execute(sql`
      select coalesce(max(po_number), 0)::int as max from "purchase_order"
      where organization_id = ${org(ctx)} and project_id = ${input.projectId}
    `) as unknown as { rows: { max: number }[] }).rows;
    const totalPaise = input.lines.reduce((s, l) => s + l.amountPaise, 0);
    const [po] = await tx.insert(purchaseOrders).values({
      id: newId(), organizationId: org(ctx), projectId: input.projectId,
      supplierId: input.supplierId, rfqId: input.rfqId ?? null, poNumber: max + 1,
      totalPaise, note: input.note ?? null, createdBy: ctx.userId,
    }).returning();
    for (const [index, line] of input.lines.entries()) {
      await tx.insert(poLines).values({
        id: newId(), organizationId: org(ctx), purchaseOrderId: po.id,
        materialId: line.materialId ?? null, costCodeId: line.costCodeId ?? null,
        description: line.description, quantity: line.quantity, unit: line.unit,
        ratePaise: line.ratePaise, amountPaise: line.amountPaise, sortOrder: index,
      });
    }
    return po;
  });
}

export async function getPurchaseOrder(db: AppDb, ctx: TenantContext, id: string): Promise<PurchaseOrder | null> {
  const [row] = await db.select().from(purchaseOrders)
    .where(and(eq(purchaseOrders.organizationId, org(ctx)), eq(purchaseOrders.id, id)));
  return row ?? null;
}

export async function listPurchaseOrders(
  db: AppDb, ctx: TenantContext, projectId: string, opts?: { statuses?: string[] },
): Promise<PurchaseOrder[]> {
  return db.select().from(purchaseOrders).where(and(
    eq(purchaseOrders.organizationId, org(ctx)), eq(purchaseOrders.projectId, projectId),
    opts?.statuses ? inArray(purchaseOrders.status, opts.statuses) : undefined,
  )).orderBy(desc(purchaseOrders.poNumber));
}

export async function listPoLines(db: AppDb, ctx: TenantContext, purchaseOrderId: string): Promise<PoLine[]> {
  return db.select().from(poLines)
    .where(and(eq(poLines.organizationId, org(ctx)), eq(poLines.purchaseOrderId, purchaseOrderId)))
    .orderBy(asc(poLines.sortOrder));
}

export async function updatePurchaseOrder(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  status: string; note: string | null;
  approvedBy: string | null; approvedAt: Date | null; exportedAt: Date | null;
}>): Promise<void> {
  await db.update(purchaseOrders).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(purchaseOrders.organizationId, org(ctx)), eq(purchaseOrders.id, id)));
}
