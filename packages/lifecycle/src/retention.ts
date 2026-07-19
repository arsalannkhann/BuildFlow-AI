import { sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { auditEvents, organizations, reportRevisions, searchDocuments, searchEmbeddings } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import { enqueueJob } from "@buildflow/jobs/queue";
import type { StoragePort } from "@buildflow/storage/port";

export const RETENTION_SWEEP_JOB = "organization.retention_sweep";

type ArtifactPolicy = {
  table: string;
  timestamp: string;
  mode: "clear" | "delete";
};

const ARTIFACT_POLICIES: ArtifactPolicy[] = [
  { table: "attachment", timestamp: "created_at", mode: "delete" },
  { table: "rfi_response", timestamp: "created_at", mode: "clear" },
  { table: "document_revision", timestamp: "created_at", mode: "clear" },
  { table: "material_receipt", timestamp: "created_at", mode: "clear" },
  { table: "invoice", timestamp: "created_at", mode: "clear" },
  { table: "mb_evidence", timestamp: "created_at", mode: "delete" },
  { table: "compliance_export", timestamp: "created_at", mode: "delete" },
  { table: "issued_document", timestamp: "issued_at", mode: "delete" },
];

async function expiredObjects(db: AppDb, organizationId: string, cutoff: Date) {
  const artifacts: { table: string; id: string; objectKey: string; mode: "clear" | "delete" }[] = [];
  for (const policy of ARTIFACT_POLICIES) {
    const result = await db.execute(sql`
      select id, object_key from ${sql.identifier(policy.table)}
      where organization_id = ${organizationId}
        and ${sql.identifier(policy.timestamp)} < ${cutoff}
        and object_key is not null`);
    for (const row of (result as unknown as { rows: { id: string; object_key: string }[] }).rows) {
      artifacts.push({ table: policy.table, id: row.id, objectKey: row.object_key, mode: policy.mode });
    }
  }
  return artifacts;
}

export async function runRetentionSweep(
  db: AppDb,
  storage: StoragePort,
  organizationId: string,
  now = new Date(),
): Promise<{ objectsDeleted: number; rowsDeleted: number; derivativesCleared: number }> {
  const orgResult = await db.execute(sql`
    select retention_days from organization where id = ${organizationId}`);
  const org = (orgResult as unknown as { rows: { retention_days: number | null }[] }).rows[0];
  if (!org?.retention_days) return { objectsDeleted: 0, rowsDeleted: 0, derivativesCleared: 0 };
  const cutoff = new Date(now.getTime() - org.retention_days * 24 * 60 * 60 * 1_000);
  const artifacts = await expiredObjects(db, organizationId, cutoff);
  for (const artifact of artifacts) await storage.delete(artifact.objectKey);

  let rowsDeleted = 0;
  let derivativesCleared = 0;
  await db.transaction(async (tx) => {
    for (const artifact of artifacts) {
      if (artifact.table === "attachment") {
        await tx.execute(sql`delete from evidence_link where organization_id = ${organizationId} and attachment_id = ${artifact.id}`);
      }
      if (artifact.table === "issued_document") {
        await tx.execute(sql`delete from client_link where organization_id = ${organizationId} and issued_document_id = ${artifact.id}`);
      }
      if (artifact.mode === "delete") {
        await tx.execute(sql`delete from ${sql.identifier(artifact.table)} where id = ${artifact.id} and organization_id = ${organizationId}`);
        rowsDeleted += 1;
      } else {
        await tx.execute(sql`
          update ${sql.identifier(artifact.table)} set
            object_key = null, file_name = null, content_type = null, byte_size = null, checksum = null
          where id = ${artifact.id} and organization_id = ${organizationId}`);
        derivativesCleared += 1;
      }
    }

    const revisions = await tx.select({ id: reportRevisions.id }).from(reportRevisions)
      .where(sql`${reportRevisions.organizationId} = ${organizationId} and ${reportRevisions.createdAt} < ${cutoff}
        and (${reportRevisions.transcript} is not null or ${reportRevisions.summaryInternal} is not null or ${reportRevisions.summaryClientSafe} is not null)`);
    if (revisions.length > 0) {
      await tx.update(reportRevisions).set({ transcript: null, summaryInternal: null, summaryClientSafe: null })
        .where(sql`${reportRevisions.organizationId} = ${organizationId} and ${reportRevisions.createdAt} < ${cutoff}`);
      derivativesCleared += revisions.length;
    }
    const oldSearch = await tx.select({ id: searchDocuments.id }).from(searchDocuments)
      .where(sql`${searchDocuments.organizationId} = ${organizationId} and ${searchDocuments.updatedAt} < ${cutoff}`);
    for (const document of oldSearch) {
      await tx.delete(searchEmbeddings).where(sql`${searchEmbeddings.organizationId} = ${organizationId} and ${searchEmbeddings.searchDocumentId} = ${document.id}`);
      await tx.delete(searchDocuments).where(sql`${searchDocuments.id} = ${document.id} and ${searchDocuments.organizationId} = ${organizationId}`);
    }
    derivativesCleared += oldSearch.length;
    await tx.insert(auditEvents).values({
      id: newId(), organizationId, actorId: "system:retention-sweeper",
      action: "organization.retention_swept", subjectRef: organizationId,
      metadata: { retentionDays: org.retention_days, objectsDeleted: artifacts.length, rowsDeleted, derivativesCleared },
    });
  });
  return { objectsDeleted: artifacts.length, rowsDeleted, derivativesCleared };
}

export async function enqueueRetentionSweeps(db: AppDb, now = new Date()): Promise<number> {
  const orgs = await db.select({ id: organizations.id }).from(organizations)
    .where(sql`${organizations.retentionDays} is not null and ${organizations.deletionApprovedAt} is null`);
  const day = now.toISOString().slice(0, 10);
  for (const org of orgs) {
    await enqueueJob(db, {
      organizationId: org.id, kind: RETENTION_SWEEP_JOB, payload: {},
      idempotencyKey: `organization.retention:${org.id}:${day}`, maxAttempts: 3,
    });
  }
  return orgs.length;
}
