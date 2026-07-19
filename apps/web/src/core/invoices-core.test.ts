import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { getInvoice, listCostEntries, listInvoiceLines, paidTotalPaise } from "@buildflow/db/queries/invoices";
import { createCostCode } from "./budget-core";
import {
  approveInvoice, createInvoice, editInvoiceLine, markInvoiceReviewed, recordPayment,
} from "./invoices-core";

async function setup() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-inv-"));
  const db = await createTestDb();
  await seed(db);
  const eng = await resolveTenantContext(db, SEED.engineer.id); // material.manage, no invoice.review
  const mgr = await resolveTenantContext(db, SEED.manager.id); // invoice.review, budget.read
  const acc = { ...mgr, capabilities: [...mgr.capabilities, "budget.manage" as const] };
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  return { db, eng, mgr, acc, storage };
}

const photo = { bytes: new TextEncoder().encode("invoice-photo"), fileName: "invoice.jpg", contentType: "image/jpeg" };

test("invoice photo -> OCR draft -> review -> approval posts cost entries exactly once", async () => {
  const { db, eng, mgr, acc, storage } = await setup();
  const invoiceId = await createInvoice(db, storage, eng, { projectId: SEED.projectId, photo });

  // OCR landed a draft header + lines; costs are untouched.
  const draft = await getInvoice(db, mgr, invoiceId);
  expect(draft?.status).toBe("draft");
  expect(draft?.ocrStatus).toBe("succeeded");
  expect(draft?.invoiceNumber).toBe("INV-7781");
  expect(draft?.invoiceDate).toBe("2026-07-15");
  expect(draft?.totalPaise).toBe(2464000);
  const lines = await listInvoiceLines(db, mgr, invoiceId);
  expect(lines.length).toBe(1);
  expect(lines[0].confidenceBand).toBe("Supported");
  expect(await listCostEntries(db, mgr, SEED.projectId)).toEqual([]);

  // Reviewer maps the line to a cost code and approves.
  const codeId = await createCostCode(db, acc, { code: "MAT-CEM", name: "Cement" });
  await editInvoiceLine(db, mgr, lines[0].id, { costCodeId: codeId });
  await markInvoiceReviewed(db, mgr, invoiceId);
  await approveInvoice(db, mgr, invoiceId);

  let entries = await listCostEntries(db, mgr, SEED.projectId);
  expect(entries.length).toBe(1);
  expect(entries[0].amountPaise).toBe(1925000);
  expect(entries[0].costCodeId).toBe(codeId);
  expect(entries[0].kind).toBe("invoice");
  expect(entries[0].sourceKind).toBe("invoice_line");

  // Approving again (retry) posts costs exactly once.
  await approveInvoice(db, mgr, invoiceId);
  entries = await listCostEntries(db, mgr, SEED.projectId);
  expect(entries.length).toBe(1);
  expect((await getInvoice(db, mgr, invoiceId))?.status).toBe("approved");
});

test("capability gates: review/approve need invoice.review; entry needs manage or review", async () => {
  const { db, eng, mgr, storage } = await setup();
  const invoiceId = await createInvoice(db, storage, eng, { projectId: SEED.projectId, photo });
  await expect(markInvoiceReviewed(db, eng, invoiceId)).rejects.toThrow(/not permitted/i);
  await expect(approveInvoice(db, eng, invoiceId)).rejects.toThrow(/not permitted/i);
  // Approval requires prior review even for the reviewer.
  await expect(approveInvoice(db, mgr, invoiceId)).rejects.toThrow(/reviewed before approval/i);

  const nobody = { ...mgr, capabilities: mgr.capabilities.filter((c) => c !== "invoice.review") };
  await expect(createInvoice(db, storage, nobody, { projectId: SEED.projectId })).rejects.toThrow(/not permitted/i);
});

test("payments are recorded only against approved invoices; cross-tenant fails closed", async () => {
  const { db, eng, mgr, storage } = await setup();
  const invoiceId = await createInvoice(db, storage, eng, { projectId: SEED.projectId, photo });
  await expect(recordPayment(db, mgr, { invoiceId, amountPaise: 100000, paidDate: "2026-07-19" }))
    .rejects.toThrow(/approved/i);

  await markInvoiceReviewed(db, mgr, invoiceId);
  await approveInvoice(db, mgr, invoiceId);
  await recordPayment(db, mgr, { invoiceId, amountPaise: 1000000, paidDate: "2026-07-19", reference: "NEFT-123" });
  expect(await paidTotalPaise(db, mgr, SEED.projectId)).toBe(1000000);

  const foreign = { ...mgr, organizationId: "org-elsewhere" };
  expect(await getInvoice(db, foreign, invoiceId)).toBeNull();
  expect(await listInvoiceLines(db, foreign, invoiceId)).toEqual([]);
});
