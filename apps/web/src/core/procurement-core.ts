import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { cmpDecimal, isDecimalString, normalizeDecimal } from "@buildflow/domain/decimal";
import { formatINR, mulQuantityPaise } from "@buildflow/domain/money";
import { toCsv } from "@buildflow/domain/csv";
import {
  addPurchaseOrder, addRfq, addRfqItem, getPurchaseOrder, getRfq, listPoLines,
  listQuotesForRfq, listRfqItems, setRfqStatus, updatePurchaseOrder, upsertQuote,
  type RfqItem, type RfqQuote,
} from "@buildflow/db/queries/procurement";
import { getSupplier } from "@buildflow/db/queries/materials";
import { audit } from "@buildflow/db/queries/audit";
import { emitEvent } from "@/core/notifications-core";

// RFQ -> manual supplier quotes -> comparison -> PO draft -> approved -> exported.
// Purchase orders are NEVER sent automatically (rules.md §11: AI/system may not create or
// approve a PO; every step here is a person with the right capability). Export is a
// manual CSV/JSON download for the org's own records / later Tally import.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createRfq(db: AppDb, ctx: TenantContext, input: {
  projectId: string; title: string; neededBy?: string | null; note?: string | null;
}): Promise<string> {
  assertCan(ctx, "procurement.manage");
  if (!input.title?.trim()) throw new Error("Title is required");
  if (input.neededBy && !DATE_RE.test(input.neededBy)) throw new Error("Needed-by must be YYYY-MM-DD");
  const row = await addRfq(db, ctx, { ...input, title: input.title.trim() });
  await audit(db, ctx, { action: "procurement.rfq_created", subjectRef: row.id, metadata: {} });
  // Phase E1 hook: procurement colleagues record manual supplier quotes on this RFQ.
  await emitEvent(db, ctx, { eventKind: "rfq.quote_requested", subjectRef: row.id, projectId: input.projectId, title: `Quotes requested: ${row.title}` });
  return row.id;
}

export async function addItemToRfq(db: AppDb, ctx: TenantContext, input: {
  rfqId: string; description: string; quantity: string; unit: string; materialId?: string | null;
}): Promise<void> {
  assertCan(ctx, "procurement.manage");
  const rfq = await getRfq(db, ctx, input.rfqId);
  if (!rfq) throw new Error("RFQ not found");
  if (rfq.status !== "open") throw new Error("Only open RFQs accept items");
  if (!input.description?.trim()) throw new Error("Description is required");
  if (!isDecimalString(input.quantity) || cmpDecimal(input.quantity, "0") <= 0) {
    throw new Error("Quantity must be a positive decimal number");
  }
  if (!input.unit?.trim()) throw new Error("Unit is required");
  await addRfqItem(db, ctx, {
    rfqId: rfq.id, description: input.description.trim(),
    quantity: normalizeDecimal(input.quantity), unit: input.unit.trim(),
    materialId: input.materialId ?? null,
  });
}

/** Quotes are entered manually from the supplier's reply; re-entering updates the quote. */
export async function recordQuote(db: AppDb, ctx: TenantContext, input: {
  rfqItemId: string; supplierId: string; ratePaise: number; deliveryDays?: number | null; notes?: string | null;
}): Promise<void> {
  assertCan(ctx, "procurement.manage");
  if (!Number.isSafeInteger(input.ratePaise) || input.ratePaise <= 0) throw new Error("Rate must be positive paise");
  if (input.deliveryDays != null && (!Number.isInteger(input.deliveryDays) || input.deliveryDays < 0)) {
    throw new Error("Delivery days must be a whole number");
  }
  if (!(await getSupplier(db, ctx, input.supplierId))) throw new Error("Supplier not found");
  await upsertQuote(db, ctx, input);
  await audit(db, ctx, { action: "procurement.quote_recorded", subjectRef: input.rfqItemId, metadata: { supplierId: input.supplierId } });
}

export type QuoteComparisonItem = {
  item: RfqItem;
  quotes: (RfqQuote & { amountPaise: number; isLowest: boolean })[];
};

/** Deterministic comparison: lowest rate wins the flag (delivery days break ties). */
export async function rfqComparison(db: AppDb, ctx: TenantContext, rfqId: string): Promise<QuoteComparisonItem[]> {
  assertCan(ctx, "project.read");
  const [items, quotes] = await Promise.all([
    listRfqItems(db, ctx, rfqId), listQuotesForRfq(db, ctx, rfqId),
  ]);
  return items.map((item) => {
    const itemQuotes = quotes
      .filter((q) => q.rfqItemId === item.id)
      .sort((a, b) => a.ratePaise - b.ratePaise || (a.deliveryDays ?? 9999) - (b.deliveryDays ?? 9999) || a.supplierId.localeCompare(b.supplierId));
    return {
      item,
      quotes: itemQuotes.map((q, index) => ({
        ...q, amountPaise: mulQuantityPaise(item.quantity, q.ratePaise), isLowest: index === 0,
      })),
    };
  });
}

/**
 * Drafts a PO for ONE supplier from their recorded quotes on the RFQ. Items without a
 * quote from that supplier are skipped. The PO starts as a DRAFT — nothing is ordered.
 */
export async function createPoDraftFromRfq(db: AppDb, ctx: TenantContext, input: {
  rfqId: string; supplierId: string; costCodeId?: string | null; note?: string | null;
}): Promise<string> {
  assertCan(ctx, "procurement.manage");
  const rfq = await getRfq(db, ctx, input.rfqId);
  if (!rfq) throw new Error("RFQ not found");
  if (!(await getSupplier(db, ctx, input.supplierId))) throw new Error("Supplier not found");
  const [items, quotes] = await Promise.all([
    listRfqItems(db, ctx, rfq.id), listQuotesForRfq(db, ctx, rfq.id),
  ]);
  const lines = [];
  for (const item of items) {
    const quote = quotes.find((q) => q.rfqItemId === item.id && q.supplierId === input.supplierId);
    if (!quote) continue;
    lines.push({
      description: item.description, quantity: item.quantity, unit: item.unit,
      ratePaise: quote.ratePaise, amountPaise: mulQuantityPaise(item.quantity, quote.ratePaise),
      materialId: item.materialId, costCodeId: input.costCodeId ?? null,
    });
  }
  if (lines.length === 0) throw new Error("This supplier has no quotes on the RFQ");
  const po = await addPurchaseOrder(db, ctx, {
    projectId: rfq.projectId, supplierId: input.supplierId, rfqId: rfq.id,
    note: input.note ?? null, lines,
  });
  await audit(db, ctx, {
    action: "procurement.po_drafted", subjectRef: po.id,
    metadata: { poNumber: po.poNumber, rfqId: rfq.id, lines: lines.length },
  });
  // Phase E1 hook: approvers (procurement.approve) learn a PO draft awaits approval.
  await emitEvent(db, ctx, { eventKind: "po.awaiting_approval", subjectRef: po.id, projectId: rfq.projectId, title: `PO #${po.poNumber} awaits approval` });
  return po.id;
}

export async function closeRfq(db: AppDb, ctx: TenantContext, rfqId: string): Promise<void> {
  assertCan(ctx, "procurement.manage");
  if (!(await getRfq(db, ctx, rfqId))) throw new Error("RFQ not found");
  await setRfqStatus(db, ctx, rfqId, "closed");
  await audit(db, ctx, { action: "procurement.rfq_closed", subjectRef: rfqId, metadata: {} });
}

/** Approval (procurement.approve) commits the PO in rollups. The PO is still not sent. */
export async function approvePurchaseOrder(db: AppDb, ctx: TenantContext, poId: string): Promise<void> {
  assertCan(ctx, "procurement.approve");
  const po = await getPurchaseOrder(db, ctx, poId);
  if (!po) throw new Error("Purchase order not found");
  if (po.status === "approved" || po.status === "exported") return; // idempotent
  if (po.status !== "draft") throw new Error("Only draft purchase orders can be approved");
  await updatePurchaseOrder(db, ctx, poId, { status: "approved", approvedBy: ctx.userId, approvedAt: new Date() });
  await audit(db, ctx, { action: "procurement.po_approved", subjectRef: poId, metadata: { poNumber: po.poNumber } });
}

/** Stamps the manual download of an approved PO. Never triggers any sending. */
export async function markPoExported(db: AppDb, ctx: TenantContext, poId: string): Promise<void> {
  assertCan(ctx, "procurement.manage");
  const po = await getPurchaseOrder(db, ctx, poId);
  if (!po) throw new Error("Purchase order not found");
  if (po.status === "exported") return; // idempotent
  if (po.status !== "approved") throw new Error("Only approved purchase orders can be exported");
  await updatePurchaseOrder(db, ctx, poId, { status: "exported", exportedAt: new Date() });
  await audit(db, ctx, { action: "procurement.po_exported", subjectRef: poId, metadata: { poNumber: po.poNumber } });
}

const inr = (paise: number): string => (paise / 100).toFixed(2); // plain decimal for imports

/** Flat CSV (one row per line) with plain-decimal INR columns for later Tally import. */
export async function poExportCsv(db: AppDb, ctx: TenantContext, poId: string): Promise<string> {
  assertCan(ctx, "procurement.manage");
  const po = await getPurchaseOrder(db, ctx, poId);
  if (!po) throw new Error("Purchase order not found");
  const [lines, supplier] = await Promise.all([
    listPoLines(db, ctx, poId), getSupplier(db, ctx, po.supplierId),
  ]);
  return toCsv(
    ["po_number", "po_date", "supplier_name", "supplier_gstin", "line_no", "description",
      "quantity", "unit", "rate_inr", "amount_inr", "currency", "po_total_inr"],
    lines.map((line, index) => [
      `PO-${po.poNumber}`, po.approvedAt?.toISOString().slice(0, 10) ?? po.createdAt.toISOString().slice(0, 10),
      supplier?.name ?? "", supplier?.gstin ?? "", index + 1, line.description,
      line.quantity, line.unit, inr(line.ratePaise), inr(line.amountPaise), line.currency,
      inr(po.totalPaise),
    ]),
  );
}

/** Structured JSON export of the same PO (schema kept flat for import tooling). */
export async function poExportJson(db: AppDb, ctx: TenantContext, poId: string): Promise<Record<string, unknown>> {
  assertCan(ctx, "procurement.manage");
  const po = await getPurchaseOrder(db, ctx, poId);
  if (!po) throw new Error("Purchase order not found");
  const [lines, supplier] = await Promise.all([
    listPoLines(db, ctx, poId), getSupplier(db, ctx, po.supplierId),
  ]);
  return {
    schema: "buildflow.po-export.v1",
    po_number: `PO-${po.poNumber}`,
    status: po.status,
    date: po.approvedAt?.toISOString().slice(0, 10) ?? po.createdAt.toISOString().slice(0, 10),
    currency: po.currency,
    supplier: supplier ? { name: supplier.name, gstin: supplier.gstin, phone: supplier.phone } : null,
    lines: lines.map((line, index) => ({
      line_no: index + 1, description: line.description,
      quantity: line.quantity, unit: line.unit,
      rate_paise: line.ratePaise, amount_paise: line.amountPaise,
      rate_inr: inr(line.ratePaise), amount_inr: inr(line.amountPaise),
    })),
    total_paise: po.totalPaise,
    total_inr: inr(po.totalPaise),
    total_display: formatINR(po.totalPaise),
  };
}
