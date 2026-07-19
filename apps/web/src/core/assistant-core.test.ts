import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { sql } from "drizzle-orm";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { upsertSearchDocument } from "@buildflow/db/queries/search";
import { askAssistant } from "./assistant-core";
import {
  createScheduleItem, raiseBlocker, registerDocument, reviseScheduleDates,
  uploadDocumentRevision,
} from "./controls-core";
import { createMaterial, recordStockMovement } from "./materials-core";
import { LocalFsStorage } from "@buildflow/storage/local-fs";

const TODAY = "2026-07-19";

async function setup() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-asst-"));
  const db = await createTestDb();
  await seed(db);
  const owner = await resolveTenantContext(db, SEED.owner.id, SEED.projectId);
  const eng = await resolveTenantContext(db, SEED.engineer.id, SEED.projectId);
  return { db, owner, eng };
}

test("the assistant core never imports an action or mutation module", () => {
  const src = readFileSync(join(__dirname, "assistant-core.ts"), "utf8");
  const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  for (const imp of imports) {
    expect(imp).not.toMatch(/\/actions\//);
    expect(imp).not.toMatch(/-core$/); // no service cores (they contain mutations)
  }
});

test("delayed projects + why-delayed: cited, record-backed explanations", async () => {
  const { db, owner } = await setup();
  const itemId = await createScheduleItem(db, owner, {
    projectId: SEED.projectId, name: "Basement slab", baselineEnd: "2026-07-01",
  });
  await reviseScheduleDates(db, owner, itemId, { currentEnd: "2026-07-10", status: "in_progress" });
  const blockerId = await raiseBlocker(db, owner, {
    projectId: SEED.projectId, title: "Rebar supply stuck", severity: "high", scheduleItemId: itemId,
  });

  const which = await askAssistant(db, owner, "Which projects are delayed?", TODAY);
  expect(which.mode).toBe("deterministic");
  expect(which.insufficientEvidence).toBe(false);
  expect(which.answer).toContain("Sector 62 Tower A");
  expect(which.citations.some((c) => c.ref === itemId)).toBe(true);

  const why = await askAssistant(db, owner, "Why is Sector 62 Tower A delayed?", TODAY);
  expect(why.answer).toContain("Basement slab");
  expect(why.answer).toContain("9 day(s)"); // 2026-07-10 -> 2026-07-19
  expect(why.answer).toContain("Rebar supply stuck");
  expect(why.answer).toContain("behind baseline");
  expect(why.citations.some((c) => c.ref === blockerId)).toBe(true);
  expect(why.citations.every((c) => c.href.startsWith("/"))).toBe(true);

  // Unknown project -> graceful refusal.
  const unknown = await askAssistant(db, owner, "Why is Atlantis Towers delayed?", TODAY);
  expect(unknown.insufficientEvidence).toBe(true);
});

test("overdue blockers, stock levels, invoices over amount, missing reports, drawing revisions", async () => {
  const { db, owner, eng } = await setup();

  await raiseBlocker(db, owner, {
    projectId: SEED.projectId, title: "NOC pending from fire department", severity: "critical", dueDate: "2026-07-10",
  });
  const overdue = await askAssistant(db, owner, "overdue blockers", TODAY);
  expect(overdue.answer).toContain("NOC pending");
  expect(overdue.answer).toContain("2026-07-10");
  expect(overdue.citations).toHaveLength(1);

  const materialId = await createMaterial(db, eng, { name: "OPC 43 Cement", unit: "bag", reorderThreshold: "100" });
  await recordStockMovement(db, eng, { projectId: SEED.projectId, materialId, kind: "received", quantity: "200" });
  await recordStockMovement(db, eng, { projectId: SEED.projectId, materialId, kind: "issued", quantity: "80" });
  const stock = await askAssistant(db, owner, "How much cement remains?", TODAY);
  expect(stock.mode).toBe("deterministic");
  expect(stock.answer).toContain("120 bag");
  expect(stock.citations[0].ref).toBe(materialId);
  // Unknown material -> graceful refusal.
  expect((await askAssistant(db, owner, "How much unobtainium remains?", TODAY)).insufficientEvidence).toBe(true);

  // Invoices over an amount, compared in paise.
  await db.execute(sql`
    insert into invoice (id, organization_id, project_id, invoice_number, status, total_paise, created_by)
    values ('inv-big', ${SEED.orgId}, ${SEED.projectId}, 'INV-9', 'approved', 7500000, ${SEED.owner.id}),
           ('inv-small', ${SEED.orgId}, ${SEED.projectId}, 'INV-10', 'draft', 4900000, ${SEED.owner.id})`);
  const inv = await askAssistant(db, owner, "invoices over ₹50,000", TODAY);
  expect(inv.answer).toContain("INV-9");
  expect(inv.answer).not.toContain("INV-10"); // 49,00,000 paise = ₹49,000 < ₹50,000
  expect(inv.citations[0].approved).toBe(true);

  // Missing reports: no reports at all -> 7-day gaps on the seeded project.
  const missing = await askAssistant(db, owner, "Which reports are missing?", TODAY);
  expect(missing.answer).toContain("Sector 62 Tower A");
  expect(missing.answer).toContain(TODAY);

  // Drawing revisions: none registered -> refusal; then one registered -> cited answer.
  expect((await askAssistant(db, owner, "latest drawing revision changes", TODAY)).insufficientEvidence).toBe(true);
  const docId = await registerDocument(db, owner, { projectId: SEED.projectId, title: "GF Structural Plan" });
  await uploadDocumentRevision(db, owner, new LocalFsStorage(process.env.STORAGE_DIR), {
    documentId: docId, revisionLabel: "R2", notes: "Column C4 relocated per RFI-3",
  });
  const drawings = await askAssistant(db, owner, "latest drawing revision changes", TODAY);
  expect(drawings.answer).toContain("GF Structural Plan Rev R2");
  expect(drawings.answer).toContain("Column C4 relocated");
  expect(drawings.citations[0].ref).toBe(docId);
});

test("free-text fallback: grounded, cited, scope-filtered; refuses without evidence", async () => {
  const { db, owner, eng } = await setup();

  // No records at all -> insufficient evidence, no invented answer.
  const nothing = await askAssistant(db, eng, "what happened with the waterproofing membrane?", TODAY);
  expect(nothing.mode).toBe("grounded");
  expect(nothing.insufficientEvidence).toBe(true);
  expect(nothing.citations).toEqual([]);

  // A matching record in scope -> extractive mock answer citing it.
  const blockerId = await raiseBlocker(db, owner, {
    projectId: SEED.projectId, title: "Waterproofing membrane failed inspection", severity: "high",
  });
  const grounded = await askAssistant(db, eng, "what happened with the waterproofing membrane?", TODAY);
  expect(grounded.insufficientEvidence).toBe(false);
  expect(grounded.answer).toContain("Waterproofing membrane failed inspection");
  expect(grounded.citations.length).toBeGreaterThanOrEqual(1);
  expect(grounded.citations[0].href).toBe(`/projects/${SEED.projectId}/blockers`);
  expect(grounded.citations[0].approved).toBe(false);
  expect(blockerId).toBeTruthy();

  // Out-of-scope records are invisible: same query on a project the engineer is not a
  // member of yields the insufficient-evidence state, not a leaked citation.
  await db.execute(sql`insert into project (id, organization_id, name) values ('p2', ${SEED.orgId}, 'Tower B')`);
  await upsertSearchDocument(db, owner, {
    kind: "blocker", refId: "b-p2", projectId: "p2",
    title: "Scaffolding permit expired", body: "scaffolding permit", recordStatus: "open",
  });
  const scoped = await askAssistant(db, eng, "scaffolding permit status", TODAY);
  expect(scoped.insufficientEvidence).toBe(true);
  const ownerView = await askAssistant(db, owner, "scaffolding permit status", TODAY);
  expect(ownerView.insufficientEvidence).toBe(false); // org-wide membership sees it
});
