import { createHash } from "node:crypto";
import type { AppDb } from "@buildflow/db/client";
import type { StoragePort } from "@buildflow/storage/port";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { newId } from "@buildflow/domain/ids";
import {
  addBlocker, addDependency, addDocument, addDocumentRevision, addProgressUpdate,
  addRfi, addRfiResponse, addScheduleItem, getBlocker, getDocument, getRfi,
  getScheduleItem, linkReportToScheduleItem, listBlockers, listProgressUpdates,
  listReportLinks, listScheduleItems, updateBlocker, updateRfi, updateScheduleItem,
  type Blocker, type ScheduleItem,
} from "@buildflow/db/queries/controls";
import { getReport, listReports } from "@buildflow/db/queries/reports";
import { audit } from "@buildflow/db/queries/audit";
import { emitEvent } from "@/core/notifications-core";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const assertDate = (v: string | null | undefined, label: string) => {
  if (v != null && v !== "" && !DATE_RE.test(v)) throw new Error(`${label} must be YYYY-MM-DD`);
};

// --- schedule ---

export async function createScheduleItem(db: AppDb, ctx: TenantContext, input: {
  projectId: string; name: string; isMilestone?: boolean; activityId?: string | null;
  baselineStart?: string | null; baselineEnd?: string | null; ownerName?: string | null;
}): Promise<string> {
  assertCan(ctx, "schedule.manage");
  if (!input.name?.trim()) throw new Error("Name is required");
  assertDate(input.baselineStart, "Baseline start");
  assertDate(input.baselineEnd, "Baseline end");
  const row = await addScheduleItem(db, ctx, { ...input, name: input.name.trim() });
  await audit(db, ctx, { action: "schedule.item_created", subjectRef: row.id, metadata: { projectId: input.projectId } });
  return row.id;
}

export async function reviseScheduleDates(db: AppDb, ctx: TenantContext, itemId: string, patch: {
  currentStart?: string | null; currentEnd?: string | null; status?: string; ownerName?: string | null;
}): Promise<void> {
  assertCan(ctx, "schedule.manage");
  assertDate(patch.currentStart, "Current start");
  assertDate(patch.currentEnd, "Current end");
  const item = await getScheduleItem(db, ctx, itemId);
  if (!item) throw new Error("Schedule item not found");
  await updateScheduleItem(db, ctx, itemId, patch);
  await audit(db, ctx, { action: "schedule.item_updated", subjectRef: itemId, metadata: { fields: Object.keys(patch) } });
}

export async function addScheduleDependency(db: AppDb, ctx: TenantContext, input: {
  projectId: string; predecessorId: string; successorId: string;
}): Promise<void> {
  assertCan(ctx, "schedule.manage");
  if (input.predecessorId === input.successorId) throw new Error("An item cannot depend on itself");
  const [pre, suc] = await Promise.all([
    getScheduleItem(db, ctx, input.predecessorId), getScheduleItem(db, ctx, input.successorId),
  ]);
  if (!pre || !suc || pre.projectId !== input.projectId || suc.projectId !== input.projectId) {
    throw new Error("Both items must belong to the project");
  }
  await addDependency(db, ctx, input);
  await audit(db, ctx, { action: "schedule.dependency_added", subjectRef: input.successorId, metadata: { predecessorId: input.predecessorId } });
}

// Manual progress with evidence: percent comes only from a person; cited evidence must be
// an APPROVED (or issued) report — drafts cannot back a progress claim (rules.md §11).
export async function recordProgress(db: AppDb, ctx: TenantContext, input: {
  projectId: string; scheduleItemId: string; percent: number; note?: string;
  evidenceReportId?: string | null;
}): Promise<void> {
  assertCan(ctx, "schedule.manage");
  if (!Number.isInteger(input.percent) || input.percent < 0 || input.percent > 100) {
    throw new Error("Percent must be an integer 0-100");
  }
  const item = await getScheduleItem(db, ctx, input.scheduleItemId);
  if (!item || item.projectId !== input.projectId) throw new Error("Schedule item not found");
  let reportId: string | null = null;
  if (input.evidenceReportId) {
    const report = await getReport(db, ctx, input.evidenceReportId);
    if (!["APPROVED", "ISSUED", "SUPERSEDED"].includes(report.status)) {
      throw new Error("Evidence must be an approved report");
    }
    reportId = report.id;
  }
  await addProgressUpdate(db, ctx, {
    projectId: input.projectId, scheduleItemId: input.scheduleItemId,
    percent: input.percent, note: input.note, reportId,
  });
  await updateScheduleItem(db, ctx, input.scheduleItemId, {
    progressPercent: input.percent,
    status: input.percent >= 100 ? "complete" : item.status === "planned" ? "in_progress" : item.status,
  });
  await audit(db, ctx, { action: "schedule.progress_recorded", subjectRef: input.scheduleItemId, metadata: { percent: input.percent, reportId } });
}

// Links an approved DPR to a schedule item as daily evidence. Never touches the
// percentage — linking is evidence, not measurement.
export async function linkApprovedReport(db: AppDb, ctx: TenantContext, input: {
  projectId: string; reportId: string; scheduleItemId: string; workItemIndex?: number | null; note?: string;
}): Promise<void> {
  assertCan(ctx, "schedule.manage");
  const report = await getReport(db, ctx, input.reportId);
  if (!["APPROVED", "ISSUED", "SUPERSEDED"].includes(report.status)) {
    throw new Error("Only approved reports can be linked to schedule activities");
  }
  const item = await getScheduleItem(db, ctx, input.scheduleItemId);
  if (!item || item.projectId !== report.projectId) throw new Error("Schedule item not found in this project");
  await linkReportToScheduleItem(db, ctx, { ...input, projectId: report.projectId });
  await audit(db, ctx, { action: "schedule.report_linked", subjectRef: input.scheduleItemId, metadata: { reportId: input.reportId } });
}

// --- blockers ---

export async function raiseBlocker(db: AppDb, ctx: TenantContext, input: {
  projectId: string; title: string; description?: string; severity?: string;
  ownerName?: string | null; dueDate?: string | null; reportId?: string | null; scheduleItemId?: string | null;
}): Promise<string> {
  assertCan(ctx, "blocker.manage");
  if (!input.title?.trim()) throw new Error("Title is required");
  if (input.severity && !["low", "medium", "high", "critical"].includes(input.severity)) {
    throw new Error("Unknown severity");
  }
  assertDate(input.dueDate, "Due date");
  const row = await addBlocker(db, ctx, { ...input, title: input.title.trim() });
  await audit(db, ctx, { action: "blocker.raised", subjectRef: row.id, metadata: { severity: row.severity } });
  // Phase E1 hook: blocker owners hear about new blockers (title + severity only).
  await emitEvent(db, ctx, { eventKind: "blocker.raised", subjectRef: row.id, projectId: input.projectId, title: `Blocker raised: ${row.title}`, body: `Severity: ${row.severity}` });
  return row.id;
}

export async function resolveBlocker(db: AppDb, ctx: TenantContext, blockerId: string, resolutionNote: string): Promise<void> {
  assertCan(ctx, "blocker.manage");
  const blocker = await getBlocker(db, ctx, blockerId);
  if (!blocker) throw new Error("Blocker not found");
  if (blocker.status === "resolved") return;
  if (!resolutionNote?.trim()) throw new Error("A resolution note is required");
  await updateBlocker(db, ctx, blockerId, {
    status: "resolved", resolutionNote: resolutionNote.trim(), resolvedAt: new Date(),
  });
  await audit(db, ctx, { action: "blocker.resolved", subjectRef: blockerId, metadata: {} });
}

export async function updateBlockerDetails(db: AppDb, ctx: TenantContext, blockerId: string, patch: {
  severity?: string; ownerName?: string | null; dueDate?: string | null; status?: string;
}): Promise<void> {
  assertCan(ctx, "blocker.manage");
  if (patch.status && !["open", "in_progress", "resolved"].includes(patch.status)) throw new Error("Unknown status");
  assertDate(patch.dueDate, "Due date");
  await updateBlocker(db, ctx, blockerId, patch);
  await audit(db, ctx, { action: "blocker.updated", subjectRef: blockerId, metadata: { fields: Object.keys(patch) } });
}

// --- RFIs ---

export async function createRfi(db: AppDb, ctx: TenantContext, input: {
  projectId: string; subject: string; question: string; assigneeName?: string | null; dueDate?: string | null;
}): Promise<string> {
  assertCan(ctx, "rfi.manage");
  if (!input.subject?.trim() || !input.question?.trim()) throw new Error("Subject and question are required");
  assertDate(input.dueDate, "Due date");
  const row = await addRfi(db, ctx, { ...input, subject: input.subject.trim(), question: input.question.trim() });
  await audit(db, ctx, { action: "rfi.created", subjectRef: row.id, metadata: { number: row.number } });
  return row.id;
}

export async function respondToRfi(db: AppDb, ctx: TenantContext, storage: StoragePort, input: {
  rfiId: string; body: string; markAnswered?: boolean;
  file?: { bytes: Uint8Array; fileName: string; contentType: string };
}): Promise<void> {
  assertCan(ctx, "rfi.manage");
  const rfi = await getRfi(db, ctx, input.rfiId);
  if (!rfi) throw new Error("RFI not found");
  if (!input.body?.trim()) throw new Error("Response body is required");
  let file;
  if (input.file) {
    const objectKey = `org/${ctx.organizationId}/rfi/${rfi.id}/${newId()}`;
    const meta = await storage.put(objectKey, input.file.bytes, input.file.contentType);
    file = { objectKey, fileName: input.file.fileName, contentType: input.file.contentType,
      byteSize: meta.byteSize, checksum: meta.checksum };
  }
  await addRfiResponse(db, ctx, { rfiId: rfi.id, body: input.body.trim(), file });
  if (input.markAnswered && rfi.status === "open") await updateRfi(db, ctx, rfi.id, { status: "answered" });
  await audit(db, ctx, { action: "rfi.responded", subjectRef: rfi.id, metadata: { hasFile: Boolean(file) } });
}

export async function setRfiStatus(db: AppDb, ctx: TenantContext, rfiId: string, status: string): Promise<void> {
  assertCan(ctx, "rfi.manage");
  if (!["open", "answered", "closed"].includes(status)) throw new Error("Unknown status");
  await updateRfi(db, ctx, rfiId, { status });
  await audit(db, ctx, { action: "rfi.status_changed", subjectRef: rfiId, metadata: { status } });
}

// --- documents ---

export async function registerDocument(db: AppDb, ctx: TenantContext, input: {
  projectId: string; title: string; docNumber?: string | null; discipline?: string | null; category?: string;
}): Promise<string> {
  assertCan(ctx, "document.manage");
  if (!input.title?.trim()) throw new Error("Title is required");
  if (input.category && !["drawing", "specification", "contract", "other"].includes(input.category)) {
    throw new Error("Unknown category");
  }
  const row = await addDocument(db, ctx, { ...input, title: input.title.trim() });
  await audit(db, ctx, { action: "document.registered", subjectRef: row.id, metadata: { category: row.category } });
  return row.id;
}

export async function uploadDocumentRevision(db: AppDb, ctx: TenantContext, storage: StoragePort, input: {
  documentId: string; revisionLabel: string; notes?: string;
  file?: { bytes: Uint8Array; fileName: string; contentType: string };
}): Promise<void> {
  assertCan(ctx, "document.manage");
  const doc = await getDocument(db, ctx, input.documentId);
  if (!doc) throw new Error("Document not found");
  if (!input.revisionLabel?.trim()) throw new Error("Revision label is required");
  let file;
  if (input.file) {
    const objectKey = `org/${ctx.organizationId}/document/${doc.id}/${newId()}`;
    const meta = await storage.put(objectKey, input.file.bytes, input.file.contentType);
    file = { objectKey, fileName: input.file.fileName, contentType: input.file.contentType,
      byteSize: meta.byteSize, checksum: meta.checksum };
  }
  const rev = await addDocumentRevision(db, ctx, {
    documentId: doc.id, revisionLabel: input.revisionLabel.trim(), notes: input.notes, file,
  });
  await audit(db, ctx, { action: "document.revision_added", subjectRef: doc.id, metadata: { revisionId: rev.id, label: rev.revisionLabel } });
}

// --- overview + explainable delay indicators ---

export type DelayIndicator = {
  scheduleItemId: string;
  name: string;
  daysLate: number;
  baselineSlipDays: number | null;
  openBlockers: { id: string; title: string; severity: string }[];
  lastEvidence: { reportId: string; date: string } | null;
  explanation: string;
};

export type ProjectOverview = {
  reporting: { last7Days: { date: string; hasApproved: boolean; hasAny: boolean }[]; awaitingReview: number; failures: number };
  delayIndicators: DelayIndicator[];
  overdueBlockers: Blocker[];
  openBlockersBySeverity: Record<string, number>;
  upcomingMilestones: ScheduleItem[];
  scheduleItems: ScheduleItem[];
};

const dayDiff = (fromIso: string, toIso: string): number =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);

const addDays = (iso: string, days: number): string =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

// Every indicator is derived from stored records and says WHY (record references), never
// a modelled guess (design.md §9: no unexplained percentages or predictions).
export async function projectOverview(
  db: AppDb, ctx: TenantContext, projectId: string, today: string = new Date().toISOString().slice(0, 10),
): Promise<ProjectOverview> {
  assertCan(ctx, "project.read");
  const [items, allBlockers, reports] = await Promise.all([
    listScheduleItems(db, ctx, projectId),
    listBlockers(db, ctx, projectId),
    listReports(db, ctx),
  ]);
  const projectReports = reports.filter((r) => r.projectId === projectId);

  const last7Days = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).map((date) => ({
    date,
    hasAny: projectReports.some((r) => r.reportDate === date),
    hasApproved: projectReports.some((r) => r.reportDate === date && ["APPROVED", "ISSUED"].includes(r.status)),
  }));

  const openBlockers = allBlockers.filter((b) => b.status !== "resolved");
  const delayIndicators: DelayIndicator[] = [];
  for (const item of items) {
    if (item.status === "complete" || !item.currentEnd || item.currentEnd >= today) continue;
    const daysLate = dayDiff(item.currentEnd, today);
    const baselineSlipDays = item.baselineEnd ? dayDiff(item.baselineEnd, item.currentEnd) : null;
    const itemBlockers = openBlockers
      .filter((b) => b.scheduleItemId === item.id)
      .map((b) => ({ id: b.id, title: b.title, severity: b.severity }));
    const updates = await listProgressUpdates(db, ctx, item.id);
    const withReport = updates.find((u) => u.reportId);
    let lastEvidence: DelayIndicator["lastEvidence"] = null;
    if (withReport?.reportId) {
      const report = projectReports.find((r) => r.id === withReport.reportId);
      if (report) lastEvidence = { reportId: report.id, date: report.reportDate };
    }
    const reasons: string[] = [
      `${item.progressPercent}% complete, current end ${item.currentEnd} is ${daysLate} day(s) before ${today}`,
    ];
    if (baselineSlipDays && baselineSlipDays > 0) reasons.push(`already ${baselineSlipDays} day(s) behind baseline ${item.baselineEnd}`);
    if (itemBlockers.length) reasons.push(`${itemBlockers.length} open blocker(s): ${itemBlockers.map((b) => b.title).join("; ")}`);
    reasons.push(lastEvidence ? `last approved evidence ${lastEvidence.date}` : "no approved report evidence recorded");
    delayIndicators.push({
      scheduleItemId: item.id, name: item.name, daysLate, baselineSlipDays,
      openBlockers: itemBlockers, lastEvidence, explanation: reasons.join(". "),
    });
  }
  delayIndicators.sort((a, b) => b.daysLate - a.daysLate);

  const openBlockersBySeverity: Record<string, number> = {};
  for (const b of openBlockers) {
    openBlockersBySeverity[b.severity] = (openBlockersBySeverity[b.severity] ?? 0) + 1;
  }

  return {
    reporting: {
      last7Days,
      awaitingReview: projectReports.filter((r) => r.status === "AWAITING_REVIEW").length,
      failures: projectReports.filter((r) => r.status === "PROCESSING_FAILED").length,
    },
    delayIndicators,
    overdueBlockers: openBlockers.filter((b) => b.dueDate && b.dueDate < today),
    openBlockersBySeverity,
    upcomingMilestones: items.filter((i) =>
      i.isMilestone && i.status !== "complete" && i.currentEnd &&
      i.currentEnd >= today && dayDiff(today, i.currentEnd) <= 30),
    scheduleItems: items,
  };
}

export { listReportLinks };

/** sha256 helper shared by upload flows. */
export const sha256hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
