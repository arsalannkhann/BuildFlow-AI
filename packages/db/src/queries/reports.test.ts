import { expect, test } from "vitest";
import { createTestDb } from "@buildflow/db/client";
import { createReport, getReport, setReportStatus, listReports } from "./reports";
import type { TenantContext } from "@buildflow/domain/tenancy";

const ctxA: TenantContext = { organizationId: "org-a", projectId: "p1", userId: "u1",
  capabilities: ["report.create"] };
const ctxB: TenantContext = { organizationId: "org-b", projectId: "p9", userId: "u9",
  capabilities: ["report.create"] };

test("create, read, status transition, list are tenant-scoped", async () => {
  const db = await createTestDb();
  const r = await createReport(db, ctxA, { reportDate: "2026-07-13", note: "hi" });
  expect(r.status).toBe("UPLOADED");

  const got = await getReport(db, ctxA, r.id);
  expect(got.id).toBe(r.id);

  await setReportStatus(db, ctxA, r.id, "PROCESSING");
  expect((await getReport(db, ctxA, r.id)).status).toBe("PROCESSING");

  const list = await listReports(db, ctxA);
  expect(list).toHaveLength(1);
});

test("cross-tenant read fails closed", async () => {
  const db = await createTestDb();
  const r = await createReport(db, ctxA, { reportDate: "2026-07-13" });
  await expect(getReport(db, ctxB, r.id)).rejects.toThrow(/not found|cross-tenant/i);
  expect(await listReports(db, ctxB)).toHaveLength(0);
});

test("illegal status transition rejected", async () => {
  const db = await createTestDb();
  const r = await createReport(db, ctxA, { reportDate: "2026-07-13" });
  await expect(setReportStatus(db, ctxA, r.id, "ISSUED")).rejects.toThrow(/illegal/i);
});

test("previousReportData returns the prior day's committed revision, tenant-scoped", async () => {
  const { addRevision } = await import("./revisions");
  const { setCurrentRevision } = await import("./reports");
  const { previousReportData } = await import("./reports");
  const { DPR_SCHEMA_VERSION } = await import("@buildflow/domain/dpr/schema");
  const db = await createTestDb();

  const base = {
    schema_version: DPR_SCHEMA_VERSION, work_items: [], labour: [], materials: [],
    equipment: [], safety_quality: [], blockers: [], tomorrow_plan: [],
    weather_site_condition: { value: null, source_refs: [], confidence_band: "Supported" as const },
  };

  // Day 1 for project p1 records a machine as unavailable and commits a revision.
  const day1 = await createReport(db, ctxA, { reportDate: "2026-07-13" });
  const rev1 = await addRevision(db, ctxA, {
    reportId: day1.id, isAiGenerated: true,
    structuredData: { ...base, equipment: [{ name: "JCB", status: "unavailable", source_refs: [], confidence_band: "Supported" }] },
  });
  await setCurrentRevision(db, ctxA, day1.id, rev1.id);

  // Day 2 asks for "the report before today".
  const prev = await previousReportData(db, ctxA, "p1", "2026-07-14");
  expect(prev?.equipment[0]?.name).toBe("JCB");

  // A different org sees nothing, even with the same project id string.
  expect(await previousReportData(db, ctxB, "p1", "2026-07-14")).toBeNull();
  // And nothing exists before day 1.
  expect(await previousReportData(db, ctxA, "p1", "2026-07-13")).toBeNull();
});
