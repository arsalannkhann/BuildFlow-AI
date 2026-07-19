import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestDb, type AppDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { capabilitiesForRole, type TenantContext } from "@buildflow/domain/tenancy";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { approveOrganizationDeletion, executeOrganizationDeletion, requestOrganizationDeletion } from "./deletion";
import { createOrganizationExportRequest, runOrganizationExport } from "./export";
import { runRetentionSweep } from "./retention";

let db: AppDb;
let storage: LocalFsStorage;
const owner: TenantContext = {
  organizationId: SEED.orgId, userId: SEED.owner.id, capabilities: capabilitiesForRole("org_owner"),
};

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
  storage = new LocalFsStorage(mkdtempSync(join(tmpdir(), "bf-lifecycle-")));
});

afterEach(() => { delete process.env.DELETION_RECEIPT_HMAC_KEY; });

test("organization export is queued, complete, downloadable, and audited", async () => {
  const exportId = await createOrganizationExportRequest(db, owner);
  await runOrganizationExport(db, storage, SEED.orgId, exportId);
  const result = await db.execute(sql`select status, object_key, byte_size from organization_export where id = ${exportId}`);
  const row = (result as unknown as { rows: { status: string; object_key: string; byte_size: number }[] }).rows[0]!;
  expect(row.status).toBe("succeeded");
  expect(row.byte_size).toBeGreaterThan(100);
  const zip = await storage.get(row.object_key);
  expect(new DataView(zip.buffer, zip.byteOffset).getUint32(0, true)).toBe(0x04034b50);
  expect(new TextDecoder().decode(zip)).toContain("manifest.json");
  const audit = await db.execute(sql`select action from audit_event where subject_ref = ${exportId} order by created_at`);
  expect((audit as unknown as { rows: { action: string }[] }).rows.map((entry) => entry.action))
    .toEqual(["organization.export_requested", "organization.export_completed"]);
});

test("retention removes expired evidence and clears inherited AI derivatives", async () => {
  const now = new Date("2026-07-19T12:00:00.000Z");
  const old = new Date("2026-05-01T12:00:00.000Z");
  const key = `org/${SEED.orgId}/report/old/audio/test.webm`;
  await storage.put(key, new Uint8Array([1, 2, 3]), "audio/webm");
  await db.execute(sql`update organization set retention_days = 30 where id = ${SEED.orgId}`);
  await db.execute(sql`insert into daily_report
    (id, organization_id, project_id, report_date, status, created_by, created_at, updated_at)
    values ('old-report', ${SEED.orgId}, ${SEED.projectId}, '2026-05-01', 'AWAITING_REVIEW', ${SEED.owner.id}, ${old}, ${old})`);
  await db.execute(sql`insert into report_revision
    (id, organization_id, report_id, revision_number, structured_data, summary_internal, summary_client_safe, transcript, created_by, created_at)
    values ('old-revision', ${SEED.orgId}, 'old-report', 1, '{}'::jsonb, 'internal', 'client', '{}'::jsonb, ${SEED.owner.id}, ${old})`);
  await db.execute(sql`insert into attachment
    (id, organization_id, project_id, report_id, kind, object_key, content_type, byte_size, checksum, uploaded_at, created_at)
    values ('old-attachment', ${SEED.orgId}, ${SEED.projectId}, 'old-report', 'audio', ${key}, 'audio/webm', 3, 'checksum', ${old}, ${old})`);

  const result = await runRetentionSweep(db, storage, SEED.orgId, now);
  expect(result.objectsDeleted).toBe(1);
  expect(await storage.exists(key)).toBe(false);
  const revision = await db.execute(sql`select transcript, summary_internal from report_revision where id = 'old-revision'`);
  expect((revision as unknown as { rows: { transcript: unknown; summary_internal: string | null }[] }).rows[0])
    .toEqual({ transcript: null, summary_internal: null });
});

test("deletion requires a second owner and a completed grace period", async () => {
  process.env.DELETION_RECEIPT_HMAC_KEY = "test-receipt-key";
  const requestedAt = new Date("2026-07-01T00:00:00.000Z");
  const secondOwner: TenantContext = {
    organizationId: SEED.orgId, userId: "second-owner", capabilities: capabilitiesForRole("org_owner"),
  };
  await db.execute(sql`insert into "user" (id, organization_id, display_name, role_hint, email)
    values ('second-owner', ${SEED.orgId}, 'Second Owner', 'org_owner', 'second@demo.buildflow.local')`);
  await requestOrganizationDeletion(db, owner, requestedAt);
  await expect(approveOrganizationDeletion(db, owner, requestedAt)).rejects.toThrow(/second/i);
  const executeAfter = await approveOrganizationDeletion(db, secondOwner, requestedAt);
  await storage.put(`org/${SEED.orgId}/evidence.bin`, new Uint8Array([1]), "application/octet-stream");
  await expect(executeOrganizationDeletion(db, storage, SEED.orgId, requestedAt)).rejects.toThrow(/grace/i);

  const result = await executeOrganizationDeletion(db, storage, SEED.orgId, new Date(executeAfter.getTime() + 1));
  expect(result.deletedObjects).toBe(1);
  const org = await db.execute(sql`select id from organization where id = ${SEED.orgId}`);
  expect((org as unknown as { rows: unknown[] }).rows).toHaveLength(0);
  const receipts = await db.execute(sql`select organization_hash from deletion_receipt`);
  expect((receipts as unknown as { rows: { organization_hash: string }[] }).rows[0]?.organization_hash).toHaveLength(64);
});
