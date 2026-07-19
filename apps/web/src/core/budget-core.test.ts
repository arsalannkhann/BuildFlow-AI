import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { getActiveBudget, listBudgetLines, listBudgets } from "@buildflow/db/queries/budgets";
import { listInvoiceLines } from "@buildflow/db/queries/invoices";
import { budgetRollup, importBudgetCsv } from "./budget-core";
import { approveInvoice, createInvoice, editInvoiceLine, markInvoiceReviewed } from "./invoices-core";

async function setup() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-bud-"));
  const db = await createTestDb();
  await seed(db);
  const eng = await resolveTenantContext(db, SEED.engineer.id);
  const mgr = await resolveTenantContext(db, SEED.manager.id); // budget.read, NO budget.manage
  const acc = { ...mgr, capabilities: [...mgr.capabilities, "budget.manage" as const] };
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  return { db, eng, mgr, acc, storage };
}

const CSV_V1 = `code,description,quantity,unit,amount_inr
MAT-CEM,Cement supply,1000,bag,"25,00,000"
LAB-RCC,RCC labour,450,cum,"18,00,000"`;

const CSV_V2 = `code,description,amount_inr
MAT-CEM,Cement supply,"30,00,000"
LAB-RCC,RCC labour,"18,00,000"`;

test("budget versions are immutable: a revision supersedes, never edits", async () => {
  const { db, mgr, acc } = await setup();
  await expect(importBudgetCsv(db, mgr, SEED.projectId, CSV_V1)).rejects.toThrow(/not permitted/i);

  const v1 = await importBudgetCsv(db, acc, SEED.projectId, CSV_V1);
  expect(v1.version).toBe(1);
  expect(v1.lines).toBe(2);
  const activeV1 = await getActiveBudget(db, mgr, SEED.projectId);
  expect(activeV1?.version).toBe(1);
  const v1Lines = await listBudgetLines(db, mgr, v1.budgetId);
  expect(v1Lines.map((l) => l.amountPaise)).toEqual([250000000, 180000000]);
  expect(v1Lines[0].quantity).toBe("1000");

  const v2 = await importBudgetCsv(db, acc, SEED.projectId, CSV_V2, "Rate revision");
  expect(v2.version).toBe(2);
  const versions = await listBudgets(db, mgr, SEED.projectId);
  expect(versions.map((b) => [b.version, b.status])).toEqual([[2, "active"], [1, "superseded"]]);
  // v1 lines still readable, unchanged — history is never rewritten.
  expect((await listBudgetLines(db, mgr, v1.budgetId)).map((l) => l.amountPaise)).toEqual([250000000, 180000000]);
});

test("rollup: budget vs actual with explainable EAC formula", async () => {
  const { db, eng, mgr, acc, storage } = await setup();
  await importBudgetCsv(db, acc, SEED.projectId, CSV_V1);

  // Approve one invoice line against MAT-CEM: ₹19,250.00 actual.
  const invoiceId = await createInvoice(db, storage, eng, {
    projectId: SEED.projectId,
    photo: { bytes: new TextEncoder().encode("inv"), fileName: "i.jpg", contentType: "image/jpeg" },
  });
  const rollupBefore = await budgetRollup(db, mgr, SEED.projectId);
  expect(rollupBefore.totals.actualPaise).toBe(0); // drafts never count
  const [line] = await listInvoiceLines(db, mgr, invoiceId);
  const cement = rollupBefore.rows.find((r) => r.code === "MAT-CEM");
  await editInvoiceLine(db, mgr, line.id, { costCodeId: cement?.costCodeId ?? null });
  await markInvoiceReviewed(db, mgr, invoiceId);
  await approveInvoice(db, mgr, invoiceId);

  const rollup = await budgetRollup(db, mgr, SEED.projectId);
  expect(rollup.budget?.version).toBe(1);
  const cementRow = rollup.rows.find((r) => r.code === "MAT-CEM");
  expect(cementRow?.budgetPaise).toBe(250000000);
  expect(cementRow?.actualPaise).toBe(1925000);
  expect(cementRow?.variancePaise).toBe(248075000);
  expect(rollup.totals.invoicedPaise).toBe(2464000); // approved invoice total
  // EAC = actual + max(remaining budget without overrun, committed − invoiced)
  expect(rollup.eac.eacPaise).toBe(1925000 + (248075000 + 180000000));
  expect(rollup.eac.formula).toContain("EAC = actual to date ₹19,250.00");
  expect(rollup.eac.formula).toContain("= ₹43,00,000.00");

  // budget.read is required to see the rollup.
  await expect(budgetRollup(db, eng, SEED.projectId)).rejects.toThrow(/not permitted/i);
});

test("cross-tenant reads fail closed", async () => {
  const { db, mgr, acc } = await setup();
  await importBudgetCsv(db, acc, SEED.projectId, CSV_V1);
  const foreign = { ...mgr, organizationId: "org-elsewhere" };
  expect(await getActiveBudget(db, foreign, SEED.projectId)).toBeNull();
  expect(await listBudgets(db, foreign, SEED.projectId)).toEqual([]);
});
