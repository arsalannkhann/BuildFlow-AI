import { createHash, createHmac } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { auditEvents, deletionReceipts, organizations } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import { assertCan, type TenantContext } from "@buildflow/domain/tenancy";
import { enqueueJob } from "@buildflow/jobs/queue";
import type { StoragePort } from "@buildflow/storage/port";

export const ORGANIZATION_DELETE_JOB = "organization.delete";
export const DELETION_GRACE_DAYS = 7;

function receiptHash(value: string): string {
  const secret = process.env.DELETION_RECEIPT_HMAC_KEY;
  if (process.env.NODE_ENV === "production" && !secret) throw new Error("DELETION_RECEIPT_HMAC_KEY is required");
  return secret
    ? createHmac("sha256", secret).update(value).digest("hex")
    : createHash("sha256").update(`local-development-only:${value}`).digest("hex");
}

export async function requestOrganizationDeletion(db: AppDb, ctx: TenantContext, now = new Date()): Promise<Date> {
  assertCan(ctx, "org.manage");
  const executeAfter = new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1_000);
  await db.transaction(async (tx) => {
    await tx.update(organizations).set({
      deletionRequestedAt: now, deletionExecuteAfter: executeAfter, deletionRequestedBy: ctx.userId,
      deletionApprovedAt: null, deletionApprovedBy: null,
    }).where(eq(organizations.id, ctx.organizationId));
    await tx.insert(auditEvents).values({
      id: newId(), organizationId: ctx.organizationId, actorId: ctx.userId,
      action: "organization.deletion_requested", subjectRef: ctx.organizationId,
      metadata: { executeAfter: executeAfter.toISOString() },
    });
  });
  return executeAfter;
}

export async function approveOrganizationDeletion(db: AppDb, ctx: TenantContext, now = new Date()): Promise<Date> {
  assertCan(ctx, "org.manage");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.organizationId)).limit(1);
  if (!org?.deletionRequestedAt || !org.deletionExecuteAfter || !org.deletionRequestedBy) throw new Error("No deletion request is awaiting approval");
  if (org.deletionRequestedBy === ctx.userId) throw new Error("A second organization owner must approve deletion");
  const requestedAt = org.deletionRequestedAt;
  const executeAfter = org.deletionExecuteAfter;
  const requestedBy = org.deletionRequestedBy;
  await db.transaction(async (tx) => {
    await tx.update(organizations).set({ deletionApprovedAt: now, deletionApprovedBy: ctx.userId })
      .where(and(eq(organizations.id, ctx.organizationId), eq(organizations.deletionRequestedBy, requestedBy)));
    await enqueueJob(tx as unknown as AppDb, {
      organizationId: ctx.organizationId, kind: ORGANIZATION_DELETE_JOB,
      payload: {}, runAfter: executeAfter, maxAttempts: 10,
      idempotencyKey: `organization.delete:${ctx.organizationId}:${requestedAt.toISOString()}`,
    });
    await tx.insert(auditEvents).values({
      id: newId(), organizationId: ctx.organizationId, actorId: ctx.userId,
      action: "organization.deletion_approved", subjectRef: ctx.organizationId,
      metadata: { executeAfter: executeAfter.toISOString() },
    });
  });
  return executeAfter;
}

export async function cancelOrganizationDeletion(db: AppDb, ctx: TenantContext): Promise<void> {
  assertCan(ctx, "org.manage");
  await db.transaction(async (tx) => {
    await tx.update(organizations).set({
      deletionRequestedAt: null, deletionExecuteAfter: null, deletionRequestedBy: null,
      deletionApprovedAt: null, deletionApprovedBy: null,
    }).where(eq(organizations.id, ctx.organizationId));
    await tx.execute(sql`delete from job where organization_id = ${ctx.organizationId} and kind = ${ORGANIZATION_DELETE_JOB} and status = 'queued'`);
    await tx.insert(auditEvents).values({
      id: newId(), organizationId: ctx.organizationId, actorId: ctx.userId,
      action: "organization.deletion_cancelled", subjectRef: ctx.organizationId, metadata: {},
    });
  });
}

async function tenantTableNames(db: AppDb): Promise<string[]> {
  const result = await db.execute(sql`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'organization_id'
    order by table_name`);
  return (result as unknown as { rows: { table_name: string }[] }).rows
    .map((row) => row.table_name).filter((name) => /^[a-z][a-z0-9_]*$/.test(name));
}

export async function executeOrganizationDeletion(
  db: AppDb,
  storage: StoragePort,
  organizationId: string,
  now = new Date(),
): Promise<{ deletedRows: number; deletedObjects: number }> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org?.deletionRequestedAt || !org.deletionApprovedAt || !org.deletionRequestedBy || !org.deletionApprovedBy || !org.deletionExecuteAfter) {
    throw new Error("Deletion is not fully approved");
  }
  if (org.deletionRequestedBy === org.deletionApprovedBy) throw new Error("Deletion requires two distinct owners");
  if (org.deletionExecuteAfter > now) throw new Error("Deletion grace period has not elapsed");

  const objectKeys = await storage.list(`org/${organizationId}`);
  for (const key of objectKeys) await storage.delete(key);
  const tables = await tenantTableNames(db);
  let deletedRows = 1;
  for (const table of tables) {
    const result = await db.execute(sql`select count(*)::text as count from ${sql.identifier(table)} where organization_id = ${organizationId}`);
    deletedRows += Number((result as unknown as { rows: { count: string }[] }).rows[0]?.count ?? 0);
  }
  const userIdsResult = await db.execute(sql`select id from "user" where organization_id = ${organizationId}`);
  const userIds = (userIdsResult as unknown as { rows: { id: string }[] }).rows.map((row) => row.id);

  await db.transaction(async (tx) => {
    await tx.insert(deletionReceipts).values({
      id: newId(), organizationHash: receiptHash(organizationId),
      requestedByHash: receiptHash(org.deletionRequestedBy!), approvedByHash: receiptHash(org.deletionApprovedBy!),
      deletedRows, deletedObjects: objectKeys.length, completedAt: now,
    });
    for (const userId of userIds) {
      await tx.execute(sql`delete from session where user_id = ${userId}`);
      await tx.execute(sql`delete from auth_credential where user_id = ${userId}`);
    }
    for (const table of tables) {
      await tx.execute(sql`delete from ${sql.identifier(table)} where organization_id = ${organizationId}`);
    }
    await tx.delete(organizations).where(eq(organizations.id, organizationId));
  });
  return { deletedRows, deletedObjects: objectKeys.length };
}
