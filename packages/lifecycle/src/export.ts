import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { auditEvents, organizationExports, organizations } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import { assertCan, type TenantContext } from "@buildflow/domain/tenancy";
import { enqueueJob } from "@buildflow/jobs/queue";
import type { StoragePort } from "@buildflow/storage/port";
import { createStoredZip, type ZipEntry } from "./zip";

export const ORGANIZATION_EXPORT_JOB = "organization.export";

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function csv(rows: Record<string, unknown>[]): string {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  const cell = (value: unknown) => `"${valueText(value).replaceAll('"', '""')}"`;
  return `${columns.map(cell).join(",")}\r\n${rows.map((row) => columns.map((key) => cell(row[key])).join(",")).join("\r\n")}\r\n`;
}

async function tenantTableNames(db: AppDb): Promise<string[]> {
  const result = await db.execute(sql`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'organization_id'
    order by table_name`);
  return (result as unknown as { rows: { table_name: string }[] }).rows
    .map((row) => row.table_name)
    .filter((name) => /^[a-z][a-z0-9_]*$/.test(name) && !["job", "organization_export"].includes(name));
}

async function tableRows(db: AppDb, tableName: string, organizationId: string): Promise<Record<string, unknown>[]> {
  const result = await db.execute(sql`select * from ${sql.identifier(tableName)} where organization_id = ${organizationId}`);
  return (result as unknown as { rows: Record<string, unknown>[] }).rows;
}

export async function createOrganizationExportRequest(db: AppDb, ctx: TenantContext): Promise<string> {
  assertCan(ctx, "org.export");
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(organizationExports).values({
      id, organizationId: ctx.organizationId, requestedBy: ctx.userId, status: "queued",
    });
    await enqueueJob(tx as unknown as AppDb, {
      organizationId: ctx.organizationId, kind: ORGANIZATION_EXPORT_JOB,
      payload: { exportId: id, userId: ctx.userId }, idempotencyKey: `organization.export:${id}`,
    });
    await tx.insert(auditEvents).values({
      id: newId(), organizationId: ctx.organizationId, actorId: ctx.userId,
      action: "organization.export_requested", subjectRef: id, metadata: {},
    });
  });
  return id;
}

export async function runOrganizationExport(
  db: AppDb,
  storage: StoragePort,
  organizationId: string,
  exportId: string,
): Promise<void> {
  const [request] = await db.select().from(organizationExports).where(and(
    eq(organizationExports.id, exportId), eq(organizationExports.organizationId, organizationId),
  )).limit(1);
  if (!request) throw new Error("Organization export request not found");
  if (request.status === "succeeded") return;
  await db.update(organizationExports).set({ status: "running", errorCategory: null })
    .where(eq(organizationExports.id, exportId));

  try {
    const [organization] = await db.select({
      id: organizations.id, name: organizations.name, settings: organizations.settings,
      plan: organizations.plan, billingStatus: organizations.billingStatus,
      retentionDays: organizations.retentionDays, createdAt: organizations.createdAt,
    }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!organization) throw new Error("Organization not found");
    const tables = await tenantTableNames(db);
    const entries: ZipEntry[] = [];
    const objects: { table: string; rowId: string; objectKey: string }[] = [];
    for (const table of tables) {
      const rows = await tableRows(db, table, organizationId);
      entries.push({ name: `registers/${table}.csv`, bytes: new TextEncoder().encode(csv(rows)) });
      for (const row of rows) {
        if (typeof row.object_key === "string") objects.push({
          table, rowId: String(row.id ?? ""), objectKey: row.object_key,
        });
      }
    }
    entries.unshift({ name: "organization.csv", bytes: new TextEncoder().encode(csv([organization])) });
    entries.push({ name: "attachments-manifest.csv", bytes: new TextEncoder().encode(csv(objects)) });
    entries.push({
      name: "manifest.json",
      bytes: new TextEncoder().encode(JSON.stringify({
        schema: "buildflow.organization-export.v1", organizationId, exportId,
        generatedAt: new Date().toISOString(), tables, attachmentCount: objects.length,
      }, null, 2)),
    });
    const zip = createStoredZip(entries);
    const objectKey = `org/${organizationId}/exports/${exportId}.zip`;
    const stored = await storage.exists(objectKey)
      ? await storage.get(objectKey).then((bytes) => ({
          checksum: request.checksum ?? createHash("sha256").update(bytes).digest("hex"),
          byteSize: bytes.byteLength,
        }))
      : await storage.put(objectKey, zip, "application/zip");
    await db.transaction(async (tx) => {
      await tx.update(organizationExports).set({
        status: "succeeded", objectKey, checksum: stored.checksum || null,
        byteSize: stored.byteSize, completedAt: new Date(), errorCategory: null,
      }).where(eq(organizationExports.id, exportId));
      await tx.insert(auditEvents).values({
        id: newId(), organizationId, actorId: "system:organization-export",
        action: "organization.export_completed", subjectRef: exportId,
        metadata: { tableCount: tables.length, attachmentCount: objects.length },
      });
    });
  } catch (error) {
    const category = error instanceof Error ? error.name : "unknown_error";
    await db.update(organizationExports).set({ status: "failed", errorCategory: category })
      .where(eq(organizationExports.id, exportId));
    throw error;
  }
}
