import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { mbEntries, mbEvidence } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type MbEntry = typeof mbEntries.$inferSelect;
export type MbEvidenceRow = typeof mbEvidence.$inferSelect;

const org = (ctx: TenantContext) => ctx.organizationId;

// Per-project sequential MB number via max+1; the unique index (project_id, mb_number)
// turns a race into a retryable conflict instead of a duplicate.
export async function addMbEntry(db: AppDb, ctx: TenantContext, input: {
  projectId: string; description: string; measurementDate: string; unit: string;
  quantity: string; formula: string;
  length?: string | null; breadth?: string | null; depth?: string | null; count?: number | null;
  activityId?: string | null; locationId?: string | null; contractorId?: string | null;
  correctsEntryId?: string | null;
}): Promise<MbEntry> {
  const [{ max }] = (await db.execute(sql`
    select coalesce(max(mb_number), 0)::int as max from "mb_entry"
    where organization_id = ${org(ctx)} and project_id = ${input.projectId}
  `) as unknown as { rows: { max: number }[] }).rows;
  const [row] = await db.insert(mbEntries).values({
    id: newId(), organizationId: org(ctx), projectId: input.projectId, mbNumber: max + 1,
    description: input.description, measurementDate: input.measurementDate, unit: input.unit,
    quantity: input.quantity, formula: input.formula,
    length: input.length ?? null, breadth: input.breadth ?? null, depth: input.depth ?? null,
    count: input.count ?? null,
    activityId: input.activityId ?? null, locationId: input.locationId ?? null,
    contractorId: input.contractorId ?? null,
    correctsEntryId: input.correctsEntryId ?? null,
    createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function getMbEntry(db: AppDb, ctx: TenantContext, id: string): Promise<MbEntry | null> {
  const [row] = await db.select().from(mbEntries)
    .where(and(eq(mbEntries.organizationId, org(ctx)), eq(mbEntries.id, id)));
  return row ?? null;
}

export async function listMbEntries(
  db: AppDb, ctx: TenantContext, projectId: string, opts?: { status?: string },
): Promise<MbEntry[]> {
  return db.select().from(mbEntries).where(and(
    eq(mbEntries.organizationId, org(ctx)), eq(mbEntries.projectId, projectId),
    opts?.status ? eq(mbEntries.status, opts.status) : undefined,
  )).orderBy(desc(mbEntries.mbNumber));
}

export async function updateMbEntry(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  description: string; measurementDate: string; unit: string; quantity: string; formula: string;
  length: string | null; breadth: string | null; depth: string | null; count: number | null;
  activityId: string | null; locationId: string | null; contractorId: string | null;
  status: string; rejectionReason: string | null; supersededBy: string | null;
  submittedAt: Date | null; verifiedBy: string | null; verifiedAt: Date | null;
  certifiedBy: string | null; certifiedAt: Date | null;
}>): Promise<void> {
  await db.update(mbEntries).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(mbEntries.organizationId, org(ctx)), eq(mbEntries.id, id)));
}

export async function addMbEvidence(db: AppDb, ctx: TenantContext, input: {
  entryId: string; objectKey: string; fileName?: string | null; contentType: string;
  byteSize: number; checksum: string;
  latitude?: number | null; longitude?: number | null; capturedAt?: Date | null;
}): Promise<MbEvidenceRow> {
  const [row] = await db.insert(mbEvidence).values({
    id: newId(), organizationId: org(ctx), entryId: input.entryId,
    objectKey: input.objectKey, fileName: input.fileName ?? null,
    contentType: input.contentType, byteSize: input.byteSize, checksum: input.checksum,
    latitude: input.latitude ?? null, longitude: input.longitude ?? null,
    capturedAt: input.capturedAt ?? null, createdBy: ctx.userId,
  }).returning();
  return row;
}

export async function listMbEvidence(db: AppDb, ctx: TenantContext, entryId: string): Promise<MbEvidenceRow[]> {
  return db.select().from(mbEvidence)
    .where(and(eq(mbEvidence.organizationId, org(ctx)), eq(mbEvidence.entryId, entryId)))
    .orderBy(asc(mbEvidence.createdAt));
}

/** Evidence counts per entry for a project (register export + list views). */
export async function mbEvidenceCounts(db: AppDb, ctx: TenantContext, projectId: string): Promise<Map<string, number>> {
  const rows = await db.select({
    entryId: mbEvidence.entryId,
    count: sql<string>`count(*)::text`,
  }).from(mbEvidence)
    .innerJoin(mbEntries, eq(mbEvidence.entryId, mbEntries.id))
    .where(and(
      eq(mbEvidence.organizationId, org(ctx)),
      eq(mbEntries.organizationId, org(ctx)),
      eq(mbEntries.projectId, projectId),
    ))
    .groupBy(mbEvidence.entryId);
  return new Map(rows.map((r) => [r.entryId, Number(r.count)]));
}
