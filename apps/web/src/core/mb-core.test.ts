import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { getMbEntry, listMbEntries, listMbEvidence } from "@buildflow/db/queries/mb";
import {
  addMbEvidencePhoto, certifyMbEntry, correctMbEntry, createMbEntry, editMbEntry,
  mbRegisterCsv, raBillCsv, rejectMbEntry, submitMbEntry, verifyMbEntry,
} from "./mb-core";

async function setup() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-mb-"));
  const db = await createTestDb();
  await seed(db);
  const eng = await resolveTenantContext(db, SEED.engineer.id); // mb.create
  const mgr = await resolveTenantContext(db, SEED.manager.id); // mb.verify, NOT mb.certify
  const qs = { ...mgr, capabilities: [...mgr.capabilities, "mb.certify" as const] };
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  return { db, eng, mgr, qs, storage };
}

const slab = {
  projectId: SEED.projectId, description: "RCC slab pour — Level 3", measurementDate: "2026-07-18",
  unit: "cum", length: "2.5", breadth: "4", depth: "0.15", count: 2,
};

test("server computes quantity deterministically and refuses mismatches", async () => {
  const { db, eng } = await setup();
  const entryId = await createMbEntry(db, eng, { ...slab, claimedQuantity: "3.00" }); // 2.5×4×0.15×2 = 3
  const entry = await getMbEntry(db, eng, entryId);
  expect(entry?.quantity).toBe("3");
  expect(entry?.formula).toBe("L×B×D×n");
  expect(entry?.mbNumber).toBe(1);

  await expect(createMbEntry(db, eng, { ...slab, claimedQuantity: "3.2" }))
    .rejects.toThrow(/mismatch: server computed 3 \(L×B×D×n\), submitted 3\.2/i);
});

test("lifecycle draft -> submitted -> verified -> certified with capability gates", async () => {
  const { db, eng, mgr, qs } = await setup();
  const entryId = await createMbEntry(db, eng, slab);

  await expect(verifyMbEntry(db, eng, entryId)).rejects.toThrow(/not permitted/i); // engineer lacks mb.verify
  await expect(verifyMbEntry(db, mgr, entryId)).rejects.toThrow(/submitted/i); // must be submitted first
  await submitMbEntry(db, eng, entryId);
  await verifyMbEntry(db, mgr, entryId);
  await expect(certifyMbEntry(db, mgr, entryId)).rejects.toThrow(/not permitted/i); // manager lacks mb.certify
  await certifyMbEntry(db, qs, entryId);

  const entry = await getMbEntry(db, eng, entryId);
  expect(entry?.status).toBe("certified");
  expect(entry?.verifiedBy).toBe(SEED.manager.id);
  expect(entry?.certifiedBy).toBe(SEED.manager.id);
  expect(entry?.certifiedAt).not.toBeNull();
});

test("rejection restarts the draft with a mandatory reason", async () => {
  const { db, eng, mgr } = await setup();
  const entryId = await createMbEntry(db, eng, slab);
  await submitMbEntry(db, eng, entryId);
  await expect(rejectMbEntry(db, mgr, entryId, "  ")).rejects.toThrow(/reason/i);
  await rejectMbEntry(db, mgr, entryId, "Depth measured at 0.14, remeasure");
  expect((await getMbEntry(db, eng, entryId))?.status).toBe("rejected");
  await editMbEntry(db, eng, entryId, { ...slab, depth: "0.14" });
  const entry = await getMbEntry(db, eng, entryId);
  expect(entry?.status).toBe("draft");
  expect(entry?.quantity).toBe("2.8");
  expect(entry?.rejectionReason).toBeNull();
});

test("certified entries are append-only: corrections supersede, never edit", async () => {
  const { db, eng, mgr, qs } = await setup();
  const entryId = await createMbEntry(db, eng, slab);
  await submitMbEntry(db, eng, entryId);
  await verifyMbEntry(db, mgr, entryId);
  await certifyMbEntry(db, qs, entryId);

  await expect(editMbEntry(db, eng, entryId, { ...slab, depth: "0.2" }))
    .rejects.toThrow(/append-only/i);

  const correctionId = await correctMbEntry(db, eng, entryId, { ...slab, depth: "0.2" });
  const original = await getMbEntry(db, eng, entryId);
  const correction = await getMbEntry(db, eng, correctionId);
  expect(original?.status).toBe("certified"); // values untouched
  expect(original?.quantity).toBe("3");
  expect(original?.supersededBy).toBe(correctionId);
  expect(correction?.correctsEntryId).toBe(entryId);
  expect(correction?.status).toBe("draft"); // earns its own verify/certify pass
  expect(correction?.quantity).toBe("4");
  expect(correction?.mbNumber).toBe(2);

  await expect(correctMbEntry(db, eng, entryId, slab)).rejects.toThrow(/already superseded/i);
});

test("geotagged evidence rows; register + RA-bill exports", async () => {
  const { db, eng, mgr, qs, storage } = await setup();
  const entryId = await createMbEntry(db, eng, slab);
  await addMbEvidencePhoto(db, eng, storage, {
    entryId, bytes: new TextEncoder().encode("photo"), fileName: "slab.jpg", contentType: "image/jpeg",
    latitude: 28.6139, longitude: 77.209, capturedAt: new Date("2026-07-18T09:30:00Z"),
  });
  const evidence = await listMbEvidence(db, eng, entryId);
  expect(evidence).toHaveLength(1);
  expect(evidence[0].latitude).toBeCloseTo(28.6139);
  expect(evidence[0].checksum).toHaveLength(64);

  await submitMbEntry(db, eng, entryId);
  await verifyMbEntry(db, mgr, entryId);
  await certifyMbEntry(db, qs, entryId);
  // A second, still-draft entry appears in the register but not the RA bill.
  await createMbEntry(db, eng, { ...slab, description: "Brickwork — Level 3", unit: "sqm", count: null, depth: null });

  const register = await mbRegisterCsv(db, mgr, SEED.projectId);
  expect(register).toContain("mb_number,measurement_date,description");
  expect(register).toContain("RCC slab pour — Level 3");
  expect(register).toContain("Brickwork — Level 3");
  expect(register).toContain("certified");

  const raBill = await raBillCsv(db, mgr, SEED.projectId);
  expect(raBill).toContain("RCC slab pour — Level 3,cum,3,MB-1,1");
  expect(raBill).not.toContain("Brickwork"); // only certified entries support an RA bill
});

test("cross-tenant reads fail closed", async () => {
  const { db, eng, mgr } = await setup();
  const entryId = await createMbEntry(db, eng, slab);
  const foreign = { ...mgr, organizationId: "org-elsewhere" };
  expect(await getMbEntry(db, foreign, entryId)).toBeNull();
  expect(await listMbEntries(db, foreign, SEED.projectId)).toEqual([]);
});
