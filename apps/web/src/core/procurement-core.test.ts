import { expect, test } from "vitest";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { getPurchaseOrder, getRfq, listPoLines } from "@buildflow/db/queries/procurement";
import { addSupplier } from "@buildflow/db/queries/materials";
import { budgetRollup } from "./budget-core";
import {
  addItemToRfq, approvePurchaseOrder, createPoDraftFromRfq, createRfq, markPoExported,
  poExportCsv, poExportJson, recordQuote, rfqComparison,
} from "./procurement-core";

async function setup() {
  const db = await createTestDb();
  await seed(db);
  const mgr = await resolveTenantContext(db, SEED.manager.id); // NO procurement.* caps
  const proc = { ...mgr, capabilities: [...mgr.capabilities, "procurement.manage" as const] };
  const approver = { ...proc, capabilities: [...proc.capabilities, "procurement.approve" as const] };
  const balaji = await addSupplier(db, proc, { name: "Shri Balaji Building Materials", gstin: "07AABCS1234E1Z5" });
  const ncr = await addSupplier(db, proc, { name: "NCR Cement Traders" });
  return { db, mgr, proc, approver, balaji, ncr };
}

test("rfq -> manual quotes -> comparison flags the lowest deterministically", async () => {
  const { db, mgr, proc, balaji, ncr } = await setup();
  await expect(createRfq(db, mgr, { projectId: SEED.projectId, title: "Cement July" }))
    .rejects.toThrow(/not permitted/i); // manager lacks procurement.manage

  const rfqId = await createRfq(db, proc, { projectId: SEED.projectId, title: "Cement July", neededBy: "2026-07-30" });
  await addItemToRfq(db, proc, { rfqId, description: "OPC 43 cement", quantity: "500", unit: "bag" });
  await addItemToRfq(db, proc, { rfqId, description: "Coarse sand", quantity: "12.5", unit: "cum" });
  const [cement, sand] = (await rfqComparison(db, proc, rfqId)).map((c) => c.item);

  await recordQuote(db, proc, { rfqItemId: cement.id, supplierId: balaji.id, ratePaise: 38500, deliveryDays: 2 });
  await recordQuote(db, proc, { rfqItemId: cement.id, supplierId: ncr.id, ratePaise: 37900, deliveryDays: 5 });
  await recordQuote(db, proc, { rfqItemId: sand.id, supplierId: balaji.id, ratePaise: 180000 });
  // Re-entering a quote updates it — no duplicate rows.
  await recordQuote(db, proc, { rfqItemId: cement.id, supplierId: balaji.id, ratePaise: 38000, deliveryDays: 2 });

  const comparison = await rfqComparison(db, proc, rfqId);
  const cementQuotes = comparison[0].quotes;
  expect(cementQuotes).toHaveLength(2);
  expect(cementQuotes[0].supplierId).toBe(ncr.id); // 37900 < 38000
  expect(cementQuotes[0].isLowest).toBe(true);
  expect(cementQuotes[0].amountPaise).toBe(500 * 37900);
  expect(cementQuotes[1].isLowest).toBe(false);
  expect(comparison[1].quotes.map((q) => q.supplierId)).toEqual([balaji.id]);
  expect(comparison[1].quotes[0].amountPaise).toBe(2250000); // 12.5 × 1800.00
});

test("PO draft -> approve (procurement.approve) -> manual export; never auto-sent", async () => {
  const { db, mgr, proc, approver, balaji } = await setup();
  const rfqId = await createRfq(db, proc, { projectId: SEED.projectId, title: "Cement July" });
  await addItemToRfq(db, proc, { rfqId, description: "OPC 43 cement", quantity: "500", unit: "bag" });
  const [{ item }] = await rfqComparison(db, proc, rfqId);
  await recordQuote(db, proc, { rfqItemId: item.id, supplierId: balaji.id, ratePaise: 38500 });

  const poId = await createPoDraftFromRfq(db, proc, { rfqId, supplierId: balaji.id });
  const draft = await getPurchaseOrder(db, proc, poId);
  expect(draft?.status).toBe("draft");
  expect(draft?.poNumber).toBe(1);
  expect(draft?.totalPaise).toBe(500 * 38500);
  expect((await listPoLines(db, proc, poId)).length).toBe(1);

  // A draft is not committed money and cannot be exported.
  expect((await budgetRollup(db, mgr, SEED.projectId)).totals.committedPaise).toBe(0);
  await expect(markPoExported(db, proc, poId)).rejects.toThrow(/approved/i);

  // Only procurement.approve may approve.
  await expect(approvePurchaseOrder(db, proc, poId)).rejects.toThrow(/not permitted/i);
  await approvePurchaseOrder(db, approver, poId);
  await approvePurchaseOrder(db, approver, poId); // idempotent
  expect((await getPurchaseOrder(db, proc, poId))?.status).toBe("approved");

  // Approved POs are COMMITTED in the budget rollup.
  expect((await budgetRollup(db, mgr, SEED.projectId)).totals.committedPaise).toBe(500 * 38500);

  // Export is a manual download: CSV + JSON, and an explicit exported stamp.
  const csv = await poExportCsv(db, proc, poId);
  expect(csv).toContain("po_number,po_date,supplier_name,supplier_gstin");
  expect(csv).toContain("PO-1");
  expect(csv).toContain("OPC 43 cement,500,bag,385.00,192500.00,INR,192500.00");
  const json = await poExportJson(db, proc, poId);
  expect(json.schema).toBe("buildflow.po-export.v1");
  expect(json.total_paise).toBe(19250000);
  expect(json.total_display).toBe("₹1,92,500.00");

  await markPoExported(db, proc, poId);
  await markPoExported(db, proc, poId); // idempotent
  const exported = await getPurchaseOrder(db, proc, poId);
  expect(exported?.status).toBe("exported");
  expect(exported?.exportedAt).not.toBeNull();
  // Still committed after export.
  expect((await budgetRollup(db, mgr, SEED.projectId)).totals.committedPaise).toBe(500 * 38500);
});

test("cross-tenant reads fail closed", async () => {
  const { db, proc, balaji } = await setup();
  const rfqId = await createRfq(db, proc, { projectId: SEED.projectId, title: "Steel" });
  await addItemToRfq(db, proc, { rfqId, description: "TMT 12mm", quantity: "5", unit: "MT" });
  const [{ item }] = await rfqComparison(db, proc, rfqId);
  await recordQuote(db, proc, { rfqItemId: item.id, supplierId: balaji.id, ratePaise: 5500000 });
  const poId = await createPoDraftFromRfq(db, proc, { rfqId, supplierId: balaji.id });

  const foreign = { ...proc, organizationId: "org-elsewhere" };
  expect(await getRfq(db, foreign, rfqId)).toBeNull();
  expect(await getPurchaseOrder(db, foreign, poId)).toBeNull();
  expect(await listPoLines(db, foreign, poId)).toEqual([]);
});
