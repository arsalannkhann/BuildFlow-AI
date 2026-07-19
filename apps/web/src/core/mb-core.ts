import type { AppDb } from "@buildflow/db/client";
import type { StoragePort } from "@buildflow/storage/port";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { newId } from "@buildflow/domain/ids";
import { addDecimal, cmpDecimal } from "@buildflow/domain/decimal";
import { computeMbQuantity, type MbDimensions } from "@buildflow/domain/mb/calc";
import { toCsv } from "@buildflow/domain/csv";
import {
  addMbEntry, addMbEvidence, getMbEntry, listMbEntries, listMbEvidence, mbEvidenceCounts,
  updateMbEntry, type MbEntry,
} from "@buildflow/db/queries/mb";
import { audit } from "@buildflow/db/queries/audit";
import { emitEvent } from "@/core/notifications-core";
import { projectMbDocument } from "@/core/search-core";

// Measurement Book (e-MB Preview) — NOT legally authoritative (memory.md: pending legal
// review; rules.md §11: AI may never finalize an MB entry — every transition here is a
// person with the right capability). Append-only after certification.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type MbEntryInput = {
  projectId: string; description: string; measurementDate: string; unit: string;
  length?: string | null; breadth?: string | null; depth?: string | null; count?: number | null;
  /** Optional client-side calculation; the server recomputes and refuses mismatches. */
  claimedQuantity?: string | null;
  activityId?: string | null; locationId?: string | null; contractorId?: string | null;
};

const computeOrRefuse = (input: MbEntryInput) => {
  const dims: MbDimensions = {
    length: input.length, breadth: input.breadth, depth: input.depth, count: input.count,
  };
  const computed = computeMbQuantity(dims);
  if (input.claimedQuantity != null && input.claimedQuantity !== "") {
    if (cmpDecimal(computed.quantity, input.claimedQuantity) !== 0) {
      throw new Error(
        `Quantity mismatch: server computed ${computed.quantity} (${computed.formula}), submitted ${input.claimedQuantity}`,
      );
    }
  }
  return computed;
};

const validateEntryInput = (input: MbEntryInput) => {
  if (!input.description?.trim()) throw new Error("Description is required");
  if (!input.unit?.trim()) throw new Error("Unit is required");
  if (!DATE_RE.test(input.measurementDate)) throw new Error("Measurement date must be YYYY-MM-DD");
};

export async function createMbEntry(db: AppDb, ctx: TenantContext, input: MbEntryInput): Promise<string> {
  assertCan(ctx, "mb.create");
  validateEntryInput(input);
  const { quantity, formula } = computeOrRefuse(input);
  const row = await addMbEntry(db, ctx, {
    ...input, description: input.description.trim(), unit: input.unit.trim(), quantity, formula,
  });
  await audit(db, ctx, {
    action: "mb.entry_created", subjectRef: row.id,
    metadata: { mbNumber: row.mbNumber, quantity, formula },
  });
  return row.id;
}

// Editable only before submission (or after rejection, which restarts the draft).
export async function editMbEntry(db: AppDb, ctx: TenantContext, entryId: string, input: MbEntryInput): Promise<void> {
  assertCan(ctx, "mb.create");
  const entry = await getMbEntry(db, ctx, entryId);
  if (!entry) throw new Error("MB entry not found");
  if (!["draft", "rejected"].includes(entry.status)) {
    throw new Error("Only draft or rejected entries can be edited; certified entries are append-only — record a correction");
  }
  validateEntryInput(input);
  const { quantity, formula } = computeOrRefuse(input);
  await updateMbEntry(db, ctx, entryId, {
    description: input.description.trim(), measurementDate: input.measurementDate,
    unit: input.unit.trim(),
    length: input.length ?? null, breadth: input.breadth ?? null, depth: input.depth ?? null,
    count: input.count ?? null, quantity, formula,
    status: "draft", rejectionReason: null,
  });
  await audit(db, ctx, { action: "mb.entry_edited", subjectRef: entryId, metadata: { quantity, formula } });
}

export async function submitMbEntry(db: AppDb, ctx: TenantContext, entryId: string): Promise<void> {
  assertCan(ctx, "mb.create");
  const entry = await getMbEntry(db, ctx, entryId);
  if (!entry) throw new Error("MB entry not found");
  if (entry.status !== "draft") throw new Error("Only draft entries can be submitted");
  await updateMbEntry(db, ctx, entryId, { status: "submitted", submittedAt: new Date() });
  await audit(db, ctx, { action: "mb.entry_submitted", subjectRef: entryId, metadata: {} });
  // Phase E1 hook: verifiers (mb.verify) learn an entry awaits verification.
  await emitEvent(db, ctx, { eventKind: "mb.awaiting_verification", subjectRef: entryId, projectId: entry.projectId, title: `MB entry #${entry.mbNumber} awaits verification` });
}

export async function verifyMbEntry(db: AppDb, ctx: TenantContext, entryId: string): Promise<void> {
  assertCan(ctx, "mb.verify");
  const entry = await getMbEntry(db, ctx, entryId);
  if (!entry) throw new Error("MB entry not found");
  if (entry.status !== "submitted") throw new Error("Only submitted entries can be verified");
  await updateMbEntry(db, ctx, entryId, { status: "verified", verifiedBy: ctx.userId, verifiedAt: new Date() });
  await audit(db, ctx, { action: "mb.entry_verified", subjectRef: entryId, metadata: {} });
}

export async function rejectMbEntry(db: AppDb, ctx: TenantContext, entryId: string, reason: string): Promise<void> {
  assertCan(ctx, "mb.verify");
  const entry = await getMbEntry(db, ctx, entryId);
  if (!entry) throw new Error("MB entry not found");
  if (entry.status !== "submitted") throw new Error("Only submitted entries can be rejected");
  if (!reason?.trim()) throw new Error("A rejection reason is required");
  await updateMbEntry(db, ctx, entryId, { status: "rejected", rejectionReason: reason.trim() });
  await audit(db, ctx, { action: "mb.entry_rejected", subjectRef: entryId, metadata: { reason: reason.trim() } });
}

export async function certifyMbEntry(db: AppDb, ctx: TenantContext, entryId: string): Promise<void> {
  assertCan(ctx, "mb.certify");
  const entry = await getMbEntry(db, ctx, entryId);
  if (!entry) throw new Error("MB entry not found");
  if (entry.status !== "verified") throw new Error("Only verified entries can be certified");
  await updateMbEntry(db, ctx, entryId, { status: "certified", certifiedBy: ctx.userId, certifiedAt: new Date() });
  await audit(db, ctx, { action: "mb.entry_certified", subjectRef: entryId, metadata: { mbNumber: entry.mbNumber } });
  await projectMbDocument(db, ctx, entryId); // Phase E3 hook: certified entry enters search
}

/**
 * Correction of a CERTIFIED entry: inserts a new draft entry with corrects_entry_id and
 * stamps superseded_by on the old row. The certified values themselves never change —
 * the correction earns its own verify/certify pass.
 */
export async function correctMbEntry(db: AppDb, ctx: TenantContext, entryId: string, input: MbEntryInput): Promise<string> {
  assertCan(ctx, "mb.create");
  const entry = await getMbEntry(db, ctx, entryId);
  if (!entry) throw new Error("MB entry not found");
  if (entry.status !== "certified") throw new Error("Only certified entries need a correction; edit drafts directly");
  if (entry.supersededBy) throw new Error("This entry is already superseded");
  validateEntryInput(input);
  const { quantity, formula } = computeOrRefuse(input);
  const correction = await addMbEntry(db, ctx, {
    ...input, description: input.description.trim(), unit: input.unit.trim(),
    quantity, formula, correctsEntryId: entry.id,
  });
  await updateMbEntry(db, ctx, entryId, { supersededBy: correction.id });
  await audit(db, ctx, {
    action: "mb.entry_corrected", subjectRef: entry.id,
    metadata: { correctionId: correction.id, mbNumber: correction.mbNumber },
  });
  return correction.id;
}

// Geotagged photo evidence. Location metadata is stored as METADATA — it may be absent or
// manipulated and is never presented as guaranteed truth (rules.md §13).
export async function addMbEvidencePhoto(db: AppDb, ctx: TenantContext, storage: StoragePort, input: {
  entryId: string; bytes: Uint8Array; fileName: string; contentType: string;
  latitude?: number | null; longitude?: number | null; capturedAt?: Date | null;
}): Promise<void> {
  assertCan(ctx, "mb.create");
  const entry = await getMbEntry(db, ctx, input.entryId);
  if (!entry) throw new Error("MB entry not found");
  if (entry.status === "certified") throw new Error("A certified entry is append-only; attach evidence to a correction");
  const objectKey = `org/${ctx.organizationId}/mb/${entry.id}/${newId()}`;
  const meta = await storage.put(objectKey, input.bytes, input.contentType);
  await addMbEvidence(db, ctx, {
    entryId: entry.id, objectKey, fileName: input.fileName, contentType: input.contentType,
    byteSize: meta.byteSize, checksum: meta.checksum,
    latitude: input.latitude ?? null, longitude: input.longitude ?? null,
    capturedAt: input.capturedAt ?? null,
  });
  await audit(db, ctx, { action: "mb.evidence_added", subjectRef: entry.id, metadata: { objectKey } });
}

// --- exports ---

const entryRow = (e: MbEntry, byId: Map<string, MbEntry>, evidence: Map<string, number>) => [
  e.mbNumber, e.measurementDate, e.description, e.unit,
  e.length ?? "", e.breadth ?? "", e.depth ?? "", e.count ?? "",
  e.quantity, e.formula, e.status,
  e.correctsEntryId ? byId.get(e.correctsEntryId)?.mbNumber ?? "" : "",
  e.supersededBy ? byId.get(e.supersededBy)?.mbNumber ?? "" : "",
  evidence.get(e.id) ?? 0,
];

/** Full MB register as CSV — every entry, every status, corrections cross-referenced. */
export async function mbRegisterCsv(db: AppDb, ctx: TenantContext, projectId: string): Promise<string> {
  assertCan(ctx, "project.read");
  const entries = await listMbEntries(db, ctx, projectId);
  const evidence = await mbEvidenceCounts(db, ctx, projectId);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const ordered = [...entries].sort((a, b) => a.mbNumber - b.mbNumber);
  return toCsv(
    ["mb_number", "measurement_date", "description", "unit", "length", "breadth", "depth", "count",
      "quantity", "formula", "status", "corrects_mb_number", "superseded_by_mb_number", "evidence_photos"],
    ordered.map((e) => entryRow(e, byId, evidence)),
  );
}

/**
 * RA-bill supporting statement: CERTIFIED, non-superseded entries grouped by work item
 * and unit with exact quantity totals and MB/evidence references. Supporting data only —
 * not a bill and not legally authoritative (e-MB Preview).
 */
export async function raBillCsv(db: AppDb, ctx: TenantContext, projectId: string): Promise<string> {
  assertCan(ctx, "project.read");
  const entries = await listMbEntries(db, ctx, projectId);
  const evidence = await mbEvidenceCounts(db, ctx, projectId);
  const certified = entries
    .filter((e) => e.status === "certified" && !e.supersededBy)
    .sort((a, b) => a.mbNumber - b.mbNumber);
  const groups = new Map<string, { description: string; unit: string; total: string; mbNumbers: number[]; photos: number }>();
  for (const e of certified) {
    const key = `${e.description.toLowerCase()}|${e.unit.toLowerCase()}`;
    const group = groups.get(key) ?? { description: e.description, unit: e.unit, total: "0", mbNumbers: [], photos: 0 };
    group.total = addDecimal(group.total, e.quantity);
    group.mbNumbers.push(e.mbNumber);
    group.photos += evidence.get(e.id) ?? 0;
    groups.set(key, group);
  }
  return toCsv(
    ["work_item", "unit", "certified_quantity", "mb_entries", "evidence_photos"],
    [...groups.values()].map((g) => [
      g.description, g.unit, g.total, g.mbNumbers.map((n) => `MB-${n}`).join(" "), g.photos,
    ]),
  );
}

export { listMbEntries, listMbEvidence };
