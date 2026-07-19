import type { AppDb } from "@buildflow/db/client";
import type { StoragePort } from "@buildflow/storage/port";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan, can } from "@buildflow/domain/tenancy";
import { newId } from "@buildflow/domain/ids";
import { toCsv } from "@buildflow/domain/csv";
import { createZip, type ZipEntry } from "@buildflow/domain/zip";
import {
  COMPLIANCE_LEGAL_CAUTION, COMPLIANCE_PACK_LABELS, complianceTemplate,
  isCompliancePackKind, type CompliancePackKind,
} from "@buildflow/domain/compliance/templates";
import {
  addComplianceExport, addCompliancePack, addComplianceRequirement, getComplianceExport,
  getCompliancePack, getComplianceRequirement, listComplianceExports,
  listCompliancePacks, listComplianceRequirements, nextComplianceExportVersion,
  updateCompliancePack, updateComplianceRequirement,
  type ComplianceExportRow, type CompliancePackRow, type ComplianceRequirementRow,
} from "@buildflow/db/queries/compliance";
import { getProject } from "@buildflow/db/queries/projects";
import { getReport } from "@buildflow/db/queries/reports";
import { getAttachment } from "@buildflow/db/queries/attachments";
import { latestIssued } from "@buildflow/db/queries/issued";
import { getDocument, listDocumentRevisions } from "@buildflow/db/queries/controls";
import { getMbEntry, listMbEvidence } from "@buildflow/db/queries/mb";
import { getUser } from "@buildflow/db/queries/notifications";
import { audit } from "@buildflow/db/queries/audit";
import { renderComplianceCoverPdf } from "@buildflow/pdf/compliance";
import { emitEvent } from "@/core/notifications-core";

export const COMPLIANCE_EVIDENCE_KINDS = [
  "report", "attachment", "document", "mb_entry", "note",
] as const;
export type ComplianceEvidenceKind = (typeof COMPLIANCE_EVIDENCE_KINDS)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const encoder = new TextEncoder();

const addDays = (iso: string, days: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const filePart = (value: string): string => {
  const cleaned = value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 80);
  return cleaned || "evidence";
};

const extensionFor = (contentType: string): string => ({
  "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png",
  "image/webp": ".webp", "text/plain": ".txt", "application/json": ".json",
}[contentType] ?? "");

function assertProjectScope(ctx: TenantContext, projectId: string): void {
  if (ctx.projectId && ctx.projectId !== projectId) throw new Error("Project access denied");
}

function assertDraft(pack: CompliancePackRow): void {
  if (pack.status !== "draft") throw new Error("Requirements are locked once a pack enters review");
}

async function packAndRequirement(db: AppDb, ctx: TenantContext, requirementId: string) {
  const requirement = await getComplianceRequirement(db, ctx, requirementId);
  if (!requirement) throw new Error("Compliance requirement not found");
  const pack = await getCompliancePack(db, ctx, requirement.packId);
  if (!pack) throw new Error("Compliance pack not found");
  assertProjectScope(ctx, pack.projectId);
  return { pack, requirement };
}

async function evidenceExists(db: AppDb, ctx: TenantContext, projectId: string, input: {
  kind: ComplianceEvidenceKind; ref?: string | null; note?: string | null;
}): Promise<void> {
  if (input.kind === "note") {
    if (!input.note?.trim()) throw new Error("A note is required for note evidence");
    if (input.ref) throw new Error("Note evidence does not use a record reference");
    return;
  }
  if (!input.ref) throw new Error("Choose an evidence record");
  if (input.kind === "report") {
    let report;
    try { report = await getReport(db, ctx, input.ref); } catch { throw new Error("Approved report evidence not found"); }
    if (report.projectId !== projectId || !["APPROVED", "ISSUED", "SUPERSEDED"].includes(report.status)) {
      throw new Error("Report evidence must be an approved record from this project");
    }
    return;
  }
  if (input.kind === "attachment") {
    const attachment = await getAttachment(db, ctx, input.ref);
    if (!attachment || attachment.projectId !== projectId) throw new Error("Attachment evidence not found in this project");
    return;
  }
  if (input.kind === "document") {
    const document = await getDocument(db, ctx, input.ref);
    if (!document || document.projectId !== projectId || !document.currentRevisionId) {
      throw new Error("Document evidence needs a current revision from this project");
    }
    return;
  }
  const entry = await getMbEntry(db, ctx, input.ref);
  if (!entry || entry.projectId !== projectId || entry.status !== "certified") {
    throw new Error("Measurement evidence must be a certified entry from this project");
  }
}

export type CompliancePackWithProgress = CompliancePackRow & {
  requirements: ComplianceRequirementRow[];
  pending: number;
  overdue: number;
};

export async function complianceDashboard(
  db: AppDb, ctx: TenantContext, projectId: string, today = new Date().toISOString().slice(0, 10),
): Promise<CompliancePackWithProgress[]> {
  assertCan(ctx, "project.read");
  assertProjectScope(ctx, projectId);
  const packs = await listCompliancePacks(db, ctx, projectId);
  return Promise.all(packs.map(async (pack) => {
    const requirements = await listComplianceRequirements(db, ctx, pack.id);
    return {
      ...pack, requirements,
      pending: requirements.filter((r) => r.status === "pending").length,
      overdue: requirements.filter((r) => r.status === "pending" && r.dueDate && r.dueDate < today).length,
    };
  }));
}

export async function createCompliancePack(db: AppDb, ctx: TenantContext, input: {
  projectId: string; kind: string; title?: string; periodStart: string; periodEnd: string;
}): Promise<string> {
  assertCan(ctx, "compliance.manage");
  assertProjectScope(ctx, input.projectId);
  if (!isCompliancePackKind(input.kind)) throw new Error("Unknown compliance pack template");
  if (!DATE_RE.test(input.periodStart) || !DATE_RE.test(input.periodEnd) || input.periodStart > input.periodEnd) {
    throw new Error("Choose a valid compliance period");
  }
  await getProject(db, ctx, input.projectId);
  const kind: CompliancePackKind = input.kind;
  const title = input.title?.trim() || `${COMPLIANCE_PACK_LABELS[kind]} · ${input.periodEnd}`;
  const pack = await addCompliancePack(db, ctx, {
    projectId: input.projectId, kind, title, periodStart: input.periodStart,
    periodEnd: input.periodEnd, legalCaution: COMPLIANCE_LEGAL_CAUTION,
  });
  const template = complianceTemplate(kind);
  for (const [index, requirement] of template.entries()) {
    await addComplianceRequirement(db, ctx, {
      packId: pack.id, requirementText: requirement.text, ownerName: requirement.ownerName,
      dueDate: addDays(input.periodEnd, requirement.dueOffsetDays), sortOrder: index,
    });
  }
  await audit(db, ctx, {
    action: "compliance.pack_created", subjectRef: pack.id,
    metadata: { kind, periodStart: input.periodStart, periodEnd: input.periodEnd, requirements: template.length },
  });

  const today = new Date().toISOString().slice(0, 10);
  const dueSoon = template.map((item) => addDays(input.periodEnd, item.dueOffsetDays))
    .filter((date) => date >= today && date <= addDays(today, 7)).sort()[0];
  if (dueSoon) {
    await emitEvent(db, ctx, {
      eventKind: "compliance.due_soon", subjectRef: pack.id, projectId: input.projectId,
      title: `Compliance evidence due ${dueSoon}: ${title}`,
    });
  }
  return pack.id;
}

export async function addCustomComplianceRequirement(db: AppDb, ctx: TenantContext, input: {
  packId: string; requirementText: string; ownerName?: string | null; dueDate?: string | null;
}): Promise<string> {
  assertCan(ctx, "compliance.manage");
  const pack = await getCompliancePack(db, ctx, input.packId);
  if (!pack) throw new Error("Compliance pack not found");
  assertProjectScope(ctx, pack.projectId);
  assertDraft(pack);
  if (!input.requirementText.trim()) throw new Error("Requirement text is required");
  if (input.dueDate && !DATE_RE.test(input.dueDate)) throw new Error("Due date must be YYYY-MM-DD");
  const existing = await listComplianceRequirements(db, ctx, pack.id);
  const row = await addComplianceRequirement(db, ctx, {
    packId: pack.id, requirementText: input.requirementText.trim(),
    ownerName: input.ownerName?.trim() || null, dueDate: input.dueDate || null,
    sortOrder: existing.length,
  });
  await audit(db, ctx, { action: "compliance.requirement_added", subjectRef: row.id, metadata: { packId: pack.id } });
  return row.id;
}

export async function satisfyComplianceRequirement(db: AppDb, ctx: TenantContext, input: {
  requirementId: string; kind: string; ref?: string | null; note?: string | null;
}): Promise<void> {
  assertCan(ctx, "compliance.manage");
  const { pack, requirement } = await packAndRequirement(db, ctx, input.requirementId);
  assertDraft(pack);
  if (!(COMPLIANCE_EVIDENCE_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error("Unknown compliance evidence type");
  }
  const kind = input.kind as ComplianceEvidenceKind;
  await evidenceExists(db, ctx, pack.projectId, { kind, ref: input.ref, note: input.note });
  await updateComplianceRequirement(db, ctx, requirement.id, {
    status: "satisfied", satisfiedByKind: kind, satisfiedByRef: input.ref || null,
    note: input.note?.trim() || null, satisfiedBy: ctx.userId, satisfiedAt: new Date(),
  });
  await audit(db, ctx, {
    action: "compliance.requirement_satisfied", subjectRef: requirement.id,
    metadata: { packId: pack.id, evidenceKind: kind, evidenceRef: input.ref || null },
  });
}

export async function markComplianceNotApplicable(
  db: AppDb, ctx: TenantContext, requirementId: string, note: string,
): Promise<void> {
  assertCan(ctx, "compliance.manage");
  const { pack, requirement } = await packAndRequirement(db, ctx, requirementId);
  assertDraft(pack);
  if (!note.trim()) throw new Error("Explain why this requirement is not applicable");
  await updateComplianceRequirement(db, ctx, requirement.id, {
    status: "not_applicable", satisfiedByKind: null, satisfiedByRef: null,
    note: note.trim(), satisfiedBy: ctx.userId, satisfiedAt: new Date(),
  });
  await audit(db, ctx, {
    action: "compliance.requirement_not_applicable", subjectRef: requirement.id,
    metadata: { packId: pack.id, note: note.trim() },
  });
}

export async function submitCompliancePack(db: AppDb, ctx: TenantContext, packId: string): Promise<void> {
  assertCan(ctx, "compliance.manage");
  const pack = await getCompliancePack(db, ctx, packId);
  if (!pack) throw new Error("Compliance pack not found");
  assertProjectScope(ctx, pack.projectId);
  assertDraft(pack);
  const requirements = await listComplianceRequirements(db, ctx, pack.id);
  if (!requirements.length) throw new Error("Add at least one requirement before review");
  const pending = requirements.filter((r) => r.status === "pending");
  if (pending.length) throw new Error(`${pending.length} requirement(s) still need evidence or a not-applicable reason`);
  await updateCompliancePack(db, ctx, pack.id, { status: "in_review" });
  await audit(db, ctx, { action: "compliance.pack_submitted", subjectRef: pack.id, metadata: { requirements: requirements.length } });
}

export async function reviewCompliancePack(db: AppDb, ctx: TenantContext, packId: string): Promise<void> {
  assertCan(ctx, "compliance.review");
  const pack = await getCompliancePack(db, ctx, packId);
  if (!pack) throw new Error("Compliance pack not found");
  assertProjectScope(ctx, pack.projectId);
  if (pack.status !== "in_review") throw new Error("Only a submitted pack can be reviewed");
  const requirements = await listComplianceRequirements(db, ctx, pack.id);
  if (!requirements.length || requirements.some((r) => r.status === "pending")) {
    throw new Error("Every requirement must be resolved before review");
  }
  await updateCompliancePack(db, ctx, pack.id, {
    status: "reviewed", reviewedBy: ctx.userId, reviewedAt: new Date(),
  });
  await audit(db, ctx, { action: "compliance.pack_reviewed", subjectRef: pack.id, metadata: { reviewerId: ctx.userId } });
}

type CollectedEvidence = { label: string; files: ZipEntry[] };

async function collectEvidence(db: AppDb, ctx: TenantContext, storage: StoragePort,
  pack: CompliancePackRow, requirement: ComplianceRequirementRow): Promise<CollectedEvidence> {
  if (requirement.status !== "satisfied" || !requirement.satisfiedByKind) return { label: requirement.status, files: [] };
  const kind = requirement.satisfiedByKind as ComplianceEvidenceKind;
  await evidenceExists(db, ctx, pack.projectId, {
    kind, ref: requirement.satisfiedByRef, note: requirement.note,
  });
  const prefix = `evidence/${String(requirement.sortOrder + 1).padStart(2, "0")}-${filePart(requirement.requirementText)}`;
  if (kind === "note") return { label: "note", files: [] };
  const ref = requirement.satisfiedByRef!;
  if (kind === "attachment") {
    const row = (await getAttachment(db, ctx, ref))!;
    return { label: `${row.kind} attachment`, files: [{
      name: `${prefix}/attachment-${row.id}${extensionFor(row.contentType)}`, bytes: await storage.get(row.objectKey),
    }] };
  }
  if (kind === "report") {
    const report = await getReport(db, ctx, ref);
    const files: ZipEntry[] = [{
      name: `${prefix}/report-record.json`, bytes: encoder.encode(JSON.stringify({
        id: report.id, date: report.reportDate, status: report.status,
        currentRevisionId: report.currentRevisionId,
      }, null, 2)),
    }];
    const issued = await latestIssued(db, ctx, ref);
    if (issued) files.push({ name: `${prefix}/issued-report-v${issued.version}.pdf`, bytes: await storage.get(issued.objectKey) });
    return { label: `report ${report.reportDate} (${report.status})`, files };
  }
  if (kind === "document") {
    const document = (await getDocument(db, ctx, ref))!;
    const revision = (await listDocumentRevisions(db, ctx, ref))
      .find((row) => row.id === document.currentRevisionId)!;
    const files: ZipEntry[] = [{
      name: `${prefix}/document-record.json`, bytes: encoder.encode(JSON.stringify({
        id: document.id, title: document.title, documentNumber: document.docNumber,
        revision: revision.revisionLabel, status: revision.status, checksum: revision.checksum,
      }, null, 2)),
    }];
    if (revision.objectKey) files.push({
      name: `${prefix}/${filePart(revision.fileName ?? document.title)}${revision.fileName ? "" : extensionFor(revision.contentType ?? "")}`,
      bytes: await storage.get(revision.objectKey),
    });
    return { label: `${document.title} revision ${revision.revisionLabel}`, files };
  }
  const entry = (await getMbEntry(db, ctx, ref))!;
  const evidence = await listMbEvidence(db, ctx, ref);
  const files: ZipEntry[] = [{
    name: `${prefix}/mb-entry-${entry.mbNumber}.json`, bytes: encoder.encode(JSON.stringify({
      id: entry.id, mbNumber: entry.mbNumber, description: entry.description,
      measurementDate: entry.measurementDate, quantity: entry.quantity, unit: entry.unit,
      formula: entry.formula, status: entry.status, certifiedAt: entry.certifiedAt,
    }, null, 2)),
  }];
  for (const row of evidence) files.push({
    name: `${prefix}/${filePart(row.fileName ?? `mb-evidence-${row.id}`)}${row.fileName ? "" : extensionFor(row.contentType)}`,
    bytes: await storage.get(row.objectKey),
  });
  return { label: `certified MB-${entry.mbNumber}`, files };
}

export async function exportCompliancePack(db: AppDb, ctx: TenantContext, storage: StoragePort,
  packId: string, deps?: { renderCover?: typeof renderComplianceCoverPdf; now?: Date },
): Promise<ComplianceExportRow> {
  if (!can(ctx, "compliance.manage") && !can(ctx, "compliance.review")) {
    throw new Error("Action not permitted: compliance.manage or compliance.review");
  }
  const pack = await getCompliancePack(db, ctx, packId);
  if (!pack) throw new Error("Compliance pack not found");
  assertProjectScope(ctx, pack.projectId);
  const project = await getProject(db, ctx, pack.projectId);
  const requirements = await listComplianceRequirements(db, ctx, pack.id);
  if (!requirements.length) throw new Error("Cannot export an empty evidence pack");
  const version = await nextComplianceExportVersion(db, ctx, pack.id);
  const now = deps?.now ?? new Date();
  const reviewed = ["reviewed", "exported"].includes(pack.status) && !!pack.reviewedAt;
  const reviewer = pack.reviewedBy ? await getUser(db, ctx, pack.reviewedBy) : null;
  const collected: { requirement: ComplianceRequirementRow; evidence: CollectedEvidence }[] = [];
  for (const requirement of requirements) {
    collected.push({ requirement, evidence: await collectEvidence(db, ctx, storage, pack, requirement) });
  }
  const summary = {
    total: requirements.length,
    satisfied: requirements.filter((r) => r.status === "satisfied").length,
    notApplicable: requirements.filter((r) => r.status === "not_applicable").length,
    pending: requirements.filter((r) => r.status === "pending").length,
  };
  const cover = await (deps?.renderCover ?? renderComplianceCoverPdf)({
    packId: pack.id, title: pack.title, projectName: project.name,
    kindLabel: COMPLIANCE_PACK_LABELS[pack.kind as CompliancePackKind],
    periodStart: pack.periodStart, periodEnd: pack.periodEnd, version,
    exportedAt: now.toISOString(), status: reviewed ? "REVIEWED" : "DRAFT",
    reviewerName: reviewer?.displayName, reviewedAt: pack.reviewedAt?.toISOString(),
    requirements: summary, legalCaution: pack.legalCaution,
  });
  const requirementsCsv = toCsv(
    ["number", "requirement", "owner", "due_date", "status", "evidence_kind", "evidence_ref", "evidence_label", "note"],
    collected.map(({ requirement: r, evidence }, index) => [
      index + 1, r.requirementText, r.ownerName, r.dueDate, r.status,
      r.satisfiedByKind, r.satisfiedByRef, evidence.label, r.note,
    ]),
  );
  const manifest = {
    schemaVersion: "buildflow.compliance-pack.v1", packId: pack.id, exportVersion: version,
    exportStatus: reviewed ? "REVIEWED" : "DRAFT", exportedAt: now.toISOString(),
    project: { id: project.id, name: project.name },
    pack: { kind: pack.kind, title: pack.title, periodStart: pack.periodStart, periodEnd: pack.periodEnd, status: pack.status },
    humanReview: reviewed ? { reviewerId: pack.reviewedBy, reviewerName: reviewer?.displayName ?? null, reviewedAt: pack.reviewedAt?.toISOString() } : null,
    legalCaution: pack.legalCaution,
    requirements: collected.map(({ requirement: r, evidence }, index) => ({
      number: index + 1, id: r.id, text: r.requirementText, owner: r.ownerName,
      dueDate: r.dueDate, status: r.status, evidenceKind: r.satisfiedByKind,
      evidenceRef: r.satisfiedByRef, note: r.note, files: evidence.files.map((f) => f.name),
    })),
  };
  const zip = createZip([
    { name: "manifest.json", bytes: encoder.encode(JSON.stringify(manifest, null, 2)) },
    { name: "requirements.csv", bytes: encoder.encode(requirementsCsv) },
    { name: "cover.pdf", bytes: cover },
    ...collected.flatMap((item) => item.evidence.files),
  ]);
  const objectKey = `org/${ctx.organizationId}/projects/${pack.projectId}/compliance/${pack.id}/v${version}-${newId()}.zip`;
  const stored = await storage.put(objectKey, zip, "application/zip");
  const row = await addComplianceExport(db, ctx, {
    projectId: pack.projectId, packId: pack.id, version, objectKey,
    checksum: stored.checksum, byteSize: stored.byteSize,
  });
  if (pack.status === "reviewed") await updateCompliancePack(db, ctx, pack.id, { status: "exported" });
  await audit(db, ctx, {
    action: "compliance.pack_exported", subjectRef: pack.id,
    metadata: { exportId: row.id, version, checksum: stored.checksum, status: reviewed ? "REVIEWED" : "DRAFT" },
  });
  return row;
}

export async function compliancePackDetail(db: AppDb, ctx: TenantContext, packId: string) {
  assertCan(ctx, "project.read");
  const pack = await getCompliancePack(db, ctx, packId);
  if (!pack) throw new Error("Compliance pack not found");
  assertProjectScope(ctx, pack.projectId);
  const [requirements, exports] = await Promise.all([
    listComplianceRequirements(db, ctx, pack.id), listComplianceExports(db, ctx, pack.id),
  ]);
  return { pack, requirements, exports };
}

export async function complianceExportForDownload(
  db: AppDb, ctx: TenantContext, projectId: string, packId: string, exportId: string,
): Promise<ComplianceExportRow> {
  assertCan(ctx, "project.read");
  assertProjectScope(ctx, projectId);
  const [pack, row] = await Promise.all([
    getCompliancePack(db, ctx, packId), getComplianceExport(db, ctx, exportId),
  ]);
  if (!pack || !row || pack.projectId !== projectId || row.projectId !== projectId || row.packId !== pack.id) {
    throw new Error("Compliance export not found");
  }
  return row;
}
