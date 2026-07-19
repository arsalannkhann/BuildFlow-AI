import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import type { StoragePort } from "@buildflow/storage/port";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { listComplianceRequirements } from "@buildflow/db/queries/compliance";
import {
  addCustomComplianceRequirement, complianceDashboard, compliancePackDetail,
  createCompliancePack, exportCompliancePack, reviewCompliancePack,
  satisfyComplianceRequirement, submitCompliancePack,
} from "./compliance-core";

class MemoryStorage implements StoragePort {
  readonly objects = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array) {
    if (this.objects.has(key)) throw new Error("immutable object exists");
    this.objects.set(key, bytes);
    return {
      checksum: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.byteLength,
    };
  }
  async get(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error("not found");
    return bytes;
  }
  async exists(key: string) { return this.objects.has(key); }
  async delete(key: string) { this.objects.delete(key); }
  async list(prefix: string) { return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort(); }
}

const fakeCover = async (input: { status: "DRAFT" | "REVIEWED"; version: number }) =>
  new TextEncoder().encode(`PDF-COVER ${input.status} VERSION-${input.version}`);

async function setup() {
  const db = await createTestDb();
  await seed(db);
  const owner = await resolveTenantContext(db, SEED.owner.id, SEED.projectId);
  const manager = await resolveTenantContext(db, SEED.manager.id, SEED.projectId);
  const engineer = await resolveTenantContext(db, SEED.engineer.id, SEED.projectId);
  return { db, owner, manager, engineer };
}

test("templates seed requirements, enforce capability, and expose overdue warnings", async () => {
  const { db, owner, engineer } = await setup();
  await expect(createCompliancePack(db, engineer, {
    projectId: SEED.projectId, kind: "dpcc_dust", periodStart: "2027-01-01", periodEnd: "2027-03-31",
  })).rejects.toThrow(/compliance.manage/);

  const packId = await createCompliancePack(db, owner, {
    projectId: SEED.projectId, kind: "dpcc_dust", title: "Dust controls Q1",
    periodStart: "2026-01-01", periodEnd: "2026-03-31",
  });
  const requirements = await listComplianceRequirements(db, owner, packId);
  expect(requirements.length).toBeGreaterThanOrEqual(4);
  expect(requirements.every((r) => r.status === "pending" && r.ownerName)).toBe(true);
  const dashboard = await complianceDashboard(db, owner, SEED.projectId, "2026-07-19");
  expect(dashboard[0].overdue).toBe(requirements.length);
  expect(dashboard[0].legalCaution).toMatch(/not legal advice/i);
});

test("record evidence is project-scoped and must be approved or certified", async () => {
  const { db, owner } = await setup();
  const packId = await createCompliancePack(db, owner, {
    projectId: SEED.projectId, kind: "custom", title: "Evidence validation",
    periodStart: "2026-07-01", periodEnd: "2026-07-31",
  });
  const requirementId = await addCustomComplianceRequirement(db, owner, {
    packId, requirementText: "Approved progress report attached",
  });
  await db.execute(sql`insert into daily_report
    (id, organization_id, project_id, report_date, status, created_by)
    values ('draft-report', ${SEED.orgId}, ${SEED.projectId}, '2026-07-18', 'DRAFT', ${SEED.owner.id})`);
  await expect(satisfyComplianceRequirement(db, owner, {
    requirementId, kind: "report", ref: "draft-report",
  })).rejects.toThrow(/approved record/);

  await db.execute(sql`insert into project (id, organization_id, name) values ('other-project', ${SEED.orgId}, 'Other Project')`);
  await db.execute(sql`insert into daily_report
    (id, organization_id, project_id, report_date, status, created_by)
    values ('other-report', ${SEED.orgId}, 'other-project', '2026-07-18', 'APPROVED', ${SEED.owner.id})`);
  await expect(satisfyComplianceRequirement(db, owner, {
    requirementId, kind: "report", ref: "other-report",
  })).rejects.toThrow(/this project/);
});

test("review is human-gated; exports are immutable, versioned, and labelled", async () => {
  const { db, owner, manager } = await setup();
  const storage = new MemoryStorage();
  const packId = await createCompliancePack(db, owner, {
    projectId: SEED.projectId, kind: "custom", title: "Quarterly evidence",
    periodStart: "2026-04-01", periodEnd: "2026-06-30",
  });
  const requirementId = await addCustomComplianceRequirement(db, owner, {
    packId, requirementText: "Project manager explanation recorded", ownerName: "Project manager",
  });
  await satisfyComplianceRequirement(db, owner, {
    requirementId, kind: "note", note: "Source registers checked by the project team.",
  });

  const draftExport = await exportCompliancePack(db, owner, storage, packId, {
    renderCover: fakeCover as never, now: new Date("2026-07-19T10:00:00Z"),
  });
  const draftText = new TextDecoder().decode(await storage.get(draftExport.objectKey));
  expect(draftExport.version).toBe(1);
  expect(draftText).toContain("DRAFT");
  expect(draftText).toContain("manifest.json");
  expect(draftText).toContain("requirements.csv");
  expect(draftText).toContain("not legal advice");

  await expect(reviewCompliancePack(db, manager, packId)).rejects.toThrow(/submitted/);
  await submitCompliancePack(db, owner, packId);
  await reviewCompliancePack(db, manager, packId);

  const reviewedExport = await exportCompliancePack(db, manager, storage, packId, {
    renderCover: fakeCover as never, now: new Date("2026-07-19T11:00:00Z"),
  });
  const next = await exportCompliancePack(db, owner, storage, packId, {
    renderCover: fakeCover as never, now: new Date("2026-07-19T12:00:00Z"),
  });
  expect([reviewedExport.version, next.version]).toEqual([2, 3]);
  expect(new Set([draftExport.objectKey, reviewedExport.objectKey, next.objectKey]).size).toBe(3);
  expect(new TextDecoder().decode(await storage.get(reviewedExport.objectKey))).toContain("REVIEWED");
  const detail = await compliancePackDetail(db, owner, packId);
  expect(detail.pack.status).toBe("exported");
  expect(detail.pack.reviewedBy).toBe(SEED.manager.id);
  expect(detail.exports.map((row) => row.version)).toEqual([3, 2, 1]);
});

test("cross-tenant pack reads and writes are denied", async () => {
  const { db, owner } = await setup();
  const packId = await createCompliancePack(db, owner, {
    projectId: SEED.projectId, kind: "custom", title: "Private pack",
    periodStart: "2026-01-01", periodEnd: "2026-01-31",
  });
  const outsider: TenantContext = {
    organizationId: "outside-org", projectId: "outside-project", userId: "outside-user",
    capabilities: ["project.read", "compliance.manage", "compliance.review"],
  };
  expect(await complianceDashboard(db, outsider, "outside-project")).toEqual([]);
  await expect(compliancePackDetail(db, outsider, packId)).rejects.toThrow(/not found/);
  await expect(addCustomComplianceRequirement(db, outsider, {
    packId, requirementText: "Should never be added",
  })).rejects.toThrow(/not found/);
});
