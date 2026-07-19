import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import {
  blockers, documentRevisions, documents, progressUpdates, reportActivityLinks,
  rfiResponses, rfis, scheduleDependencies, scheduleItems,
} from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type ScheduleItem = typeof scheduleItems.$inferSelect;
export type Blocker = typeof blockers.$inferSelect;
export type Rfi = typeof rfis.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentRevision = typeof documentRevisions.$inferSelect;
export type ProgressUpdate = typeof progressUpdates.$inferSelect;
export type ReportActivityLink = typeof reportActivityLinks.$inferSelect;

const org = (ctx: TenantContext) => ctx.organizationId;

// --- schedule ---

export async function listScheduleItems(db: AppDb, ctx: TenantContext, projectId: string): Promise<ScheduleItem[]> {
  return db.select().from(scheduleItems)
    .where(and(eq(scheduleItems.organizationId, org(ctx)), eq(scheduleItems.projectId, projectId)))
    .orderBy(asc(scheduleItems.sortOrder), asc(scheduleItems.createdAt));
}

export async function getScheduleItem(db: AppDb, ctx: TenantContext, id: string): Promise<ScheduleItem | null> {
  const [row] = await db.select().from(scheduleItems)
    .where(and(eq(scheduleItems.organizationId, org(ctx)), eq(scheduleItems.id, id)));
  return row ?? null;
}

export async function addScheduleItem(db: AppDb, ctx: TenantContext, input: {
  projectId: string; name: string; isMilestone?: boolean; activityId?: string | null;
  baselineStart?: string | null; baselineEnd?: string | null;
  currentStart?: string | null; currentEnd?: string | null;
  ownerName?: string | null; sortOrder?: number;
}): Promise<ScheduleItem> {
  const [row] = await db.insert(scheduleItems).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    name: input.name, isMilestone: input.isMilestone ?? false, activityId: input.activityId ?? null,
    baselineStart: input.baselineStart ?? null, baselineEnd: input.baselineEnd ?? null,
    currentStart: input.currentStart ?? input.baselineStart ?? null,
    currentEnd: input.currentEnd ?? input.baselineEnd ?? null,
    ownerName: input.ownerName ?? null, sortOrder: input.sortOrder ?? 0,
  }).returning();
  return row;
}

export async function updateScheduleItem(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  name: string; currentStart: string | null; currentEnd: string | null;
  status: string; ownerName: string | null; progressPercent: number; sortOrder: number;
}>): Promise<void> {
  await db.update(scheduleItems).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(scheduleItems.organizationId, org(ctx)), eq(scheduleItems.id, id)));
}

export async function addDependency(db: AppDb, ctx: TenantContext, input: {
  projectId: string; predecessorId: string; successorId: string;
}): Promise<void> {
  await db.insert(scheduleDependencies).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    predecessorId: input.predecessorId, successorId: input.successorId,
  }).onConflictDoNothing();
}

export async function listDependencies(db: AppDb, ctx: TenantContext, projectId: string) {
  return db.select().from(scheduleDependencies).where(and(
    eq(scheduleDependencies.organizationId, org(ctx)), eq(scheduleDependencies.projectId, projectId)));
}

export async function addProgressUpdate(db: AppDb, ctx: TenantContext, input: {
  projectId: string; scheduleItemId: string; percent: number; note?: string;
  reportId?: string | null; attachmentId?: string | null;
}): Promise<ProgressUpdate> {
  const [row] = await db.insert(progressUpdates).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    scheduleItemId: input.scheduleItemId, percent: input.percent, note: input.note ?? null,
    reportId: input.reportId ?? null, attachmentId: input.attachmentId ?? null,
    createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function listProgressUpdates(db: AppDb, ctx: TenantContext, scheduleItemId: string): Promise<ProgressUpdate[]> {
  return db.select().from(progressUpdates)
    .where(and(eq(progressUpdates.organizationId, org(ctx)), eq(progressUpdates.scheduleItemId, scheduleItemId)))
    .orderBy(desc(progressUpdates.createdAt));
}

// --- blockers ---

export async function listBlockers(db: AppDb, ctx: TenantContext, projectId: string, opts?: { status?: string }): Promise<Blocker[]> {
  return db.select().from(blockers).where(and(
    eq(blockers.organizationId, org(ctx)), eq(blockers.projectId, projectId),
    opts?.status ? eq(blockers.status, opts.status) : undefined,
  )).orderBy(desc(blockers.createdAt));
}

export async function getBlocker(db: AppDb, ctx: TenantContext, id: string): Promise<Blocker | null> {
  const [row] = await db.select().from(blockers)
    .where(and(eq(blockers.organizationId, org(ctx)), eq(blockers.id, id)));
  return row ?? null;
}

export async function addBlocker(db: AppDb, ctx: TenantContext, input: {
  projectId: string; title: string; description?: string; severity?: string;
  ownerName?: string | null; dueDate?: string | null; reportId?: string | null;
  scheduleItemId?: string | null;
}): Promise<Blocker> {
  const [row] = await db.insert(blockers).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    title: input.title, description: input.description ?? null,
    severity: input.severity ?? "medium", ownerName: input.ownerName ?? null,
    dueDate: input.dueDate ?? null, reportId: input.reportId ?? null,
    scheduleItemId: input.scheduleItemId ?? null, createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function updateBlocker(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  title: string; description: string | null; severity: string; status: string;
  ownerName: string | null; dueDate: string | null; resolutionNote: string | null;
  resolvedAt: Date | null; scheduleItemId: string | null;
}>): Promise<void> {
  await db.update(blockers).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(blockers.organizationId, org(ctx)), eq(blockers.id, id)));
}

// --- RFIs ---

export async function listRfis(db: AppDb, ctx: TenantContext, projectId: string): Promise<Rfi[]> {
  return db.select().from(rfis)
    .where(and(eq(rfis.organizationId, org(ctx)), eq(rfis.projectId, projectId)))
    .orderBy(desc(rfis.number));
}

export async function getRfi(db: AppDb, ctx: TenantContext, id: string): Promise<Rfi | null> {
  const [row] = await db.select().from(rfis)
    .where(and(eq(rfis.organizationId, org(ctx)), eq(rfis.id, id)));
  return row ?? null;
}

// Per-project sequence via max+1 inside the caller's transaction; the unique index
// (project_id, number) turns a race into a retryable conflict instead of a duplicate.
export async function addRfi(db: AppDb, ctx: TenantContext, input: {
  projectId: string; subject: string; question: string;
  assigneeName?: string | null; dueDate?: string | null;
}): Promise<Rfi> {
  const [{ max }] = (await db.execute(sql`
    select coalesce(max(number), 0)::int as max from "rfi"
    where organization_id = ${org(ctx)} and project_id = ${input.projectId}
  `) as unknown as { rows: { max: number }[] }).rows;
  const [row] = await db.insert(rfis).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId, number: max + 1,
    subject: input.subject, question: input.question,
    assigneeName: input.assigneeName ?? null, dueDate: input.dueDate ?? null,
    createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function updateRfi(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  status: string; assigneeName: string | null; dueDate: string | null;
}>): Promise<void> {
  await db.update(rfis).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(rfis.organizationId, org(ctx)), eq(rfis.id, id)));
}

export async function addRfiResponse(db: AppDb, ctx: TenantContext, input: {
  rfiId: string; body: string;
  file?: { objectKey: string; fileName: string; contentType: string; byteSize: number; checksum: string };
}): Promise<void> {
  await db.insert(rfiResponses).values({
    id: newId(), organizationId: org(ctx), rfiId: input.rfiId, body: input.body,
    objectKey: input.file?.objectKey ?? null, fileName: input.file?.fileName ?? null,
    contentType: input.file?.contentType ?? null, byteSize: input.file?.byteSize ?? null,
    checksum: input.file?.checksum ?? null, createdBy: ctx.userId,
  });
}

export async function listRfiResponses(db: AppDb, ctx: TenantContext, rfiId: string) {
  return db.select().from(rfiResponses)
    .where(and(eq(rfiResponses.organizationId, org(ctx)), eq(rfiResponses.rfiId, rfiId)))
    .orderBy(asc(rfiResponses.createdAt));
}

// --- documents ---

export async function listDocuments(db: AppDb, ctx: TenantContext, projectId: string): Promise<DocumentRow[]> {
  return db.select().from(documents)
    .where(and(eq(documents.organizationId, org(ctx)), eq(documents.projectId, projectId)))
    .orderBy(asc(documents.title));
}

export async function getDocument(db: AppDb, ctx: TenantContext, id: string): Promise<DocumentRow | null> {
  const [row] = await db.select().from(documents)
    .where(and(eq(documents.organizationId, org(ctx)), eq(documents.id, id)));
  return row ?? null;
}

export async function addDocument(db: AppDb, ctx: TenantContext, input: {
  projectId: string; title: string; docNumber?: string | null; discipline?: string | null; category?: string;
}): Promise<DocumentRow> {
  const [row] = await db.insert(documents).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId, title: input.title,
    docNumber: input.docNumber ?? null, discipline: input.discipline ?? null,
    category: input.category ?? "drawing", createdBy: ctx.userId,
  }).returning();
  return row;
}

/** Appends a revision and moves the current pointer; earlier revisions become superseded. */
export async function addDocumentRevision(db: AppDb, ctx: TenantContext, input: {
  documentId: string; revisionLabel: string; notes?: string;
  file?: { objectKey: string; fileName: string; contentType: string; byteSize: number; checksum: string };
}): Promise<DocumentRevision> {
  const id = newId();
  const [row] = await db.insert(documentRevisions).values({
    id, organizationId: org(ctx), documentId: input.documentId,
    revisionLabel: input.revisionLabel, notes: input.notes ?? null,
    objectKey: input.file?.objectKey ?? null, fileName: input.file?.fileName ?? null,
    contentType: input.file?.contentType ?? null, byteSize: input.file?.byteSize ?? null,
    checksum: input.file?.checksum ?? null, createdBy: ctx.userId,
  }).returning();
  await db.update(documentRevisions).set({ status: "superseded" }).where(and(
    eq(documentRevisions.organizationId, org(ctx)),
    eq(documentRevisions.documentId, input.documentId),
    sql`${documentRevisions.id} <> ${id}`,
  ));
  await db.update(documents).set({ currentRevisionId: id })
    .where(and(eq(documents.organizationId, org(ctx)), eq(documents.id, input.documentId)));
  return row;
}

export async function listDocumentRevisions(db: AppDb, ctx: TenantContext, documentId: string): Promise<DocumentRevision[]> {
  return db.select().from(documentRevisions)
    .where(and(eq(documentRevisions.organizationId, org(ctx)), eq(documentRevisions.documentId, documentId)))
    .orderBy(desc(documentRevisions.createdAt));
}

// --- DPR <-> schedule links ---

export async function linkReportToScheduleItem(db: AppDb, ctx: TenantContext, input: {
  projectId: string; reportId: string; scheduleItemId: string; workItemIndex?: number | null; note?: string;
}): Promise<void> {
  await db.insert(reportActivityLinks).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId,
    reportId: input.reportId, scheduleItemId: input.scheduleItemId,
    workItemIndex: input.workItemIndex ?? null, note: input.note ?? null, createdBy: ctx.userId,
  }).onConflictDoNothing();
}

export async function listReportLinks(db: AppDb, ctx: TenantContext, filter: { reportId?: string; scheduleItemId?: string }): Promise<ReportActivityLink[]> {
  return db.select().from(reportActivityLinks).where(and(
    eq(reportActivityLinks.organizationId, org(ctx)),
    filter.reportId ? eq(reportActivityLinks.reportId, filter.reportId) : undefined,
    filter.scheduleItemId ? eq(reportActivityLinks.scheduleItemId, filter.scheduleItemId) : undefined,
  )).orderBy(desc(reportActivityLinks.createdAt));
}
