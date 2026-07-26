import { expect, test } from "vitest";
import { createTestDb } from "@buildflow/db/client";
import { DPR_SCHEMA_VERSION, type DprStructuredData } from "@buildflow/domain/dpr/schema";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { createReport, setCurrentRevision, setReportStatus } from "./reports";
import { addRevision } from "./revisions";
import { addMbEntry, updateMbEntry } from "./mb";
import { addAttendance } from "./labour";
import {
  listApprovedReportRevisions, listAttendanceOnDate, listCertifiedMeasurements,
} from "./reporting";

const ctxA: TenantContext = {
  organizationId: "org-a", projectId: "p1", userId: "u1",
  capabilities: ["report.create", "mb.create", "labour.manage"],
};
const ctxB: TenantContext = {
  organizationId: "org-b", projectId: "p1", userId: "u9",
  capabilities: ["report.create", "mb.create", "labour.manage"],
};

const empty = (quantity: string | null): DprStructuredData => ({
  schema_version: DPR_SCHEMA_VERSION,
  work_items: quantity === null ? [] : [{
    description: "Slab pour", location: null, activity: "RCC",
    quantity: { value: quantity, unit: "cum" }, source_refs: [], confidence_band: "Supported",
  }],
  labour: [], materials: [], equipment: [], safety_quality: [], blockers: [], tomorrow_plan: [],
  weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" },
});

async function approvedReport(db: Awaited<ReturnType<typeof createTestDb>>, ctx: TenantContext, date: string, quantity: string) {
  const report = await createReport(db, ctx, { reportDate: date });
  const rev = await addRevision(db, ctx, {
    reportId: report.id, structuredData: empty(quantity), isAiGenerated: true,
  });
  await setCurrentRevision(db, ctx, report.id, rev.id);
  await setReportStatus(db, ctx, report.id, "PROCESSING");
  await setReportStatus(db, ctx, report.id, "AWAITING_REVIEW");
  await setReportStatus(db, ctx, report.id, "APPROVED");
  return report.id;
}

test("approved report revisions are filtered by date and never cross tenants", async () => {
  const db = await createTestDb();
  await approvedReport(db, ctxA, "2026-07-18", "2");
  await approvedReport(db, ctxA, "2026-07-20", "3");

  // A draft (AWAITING_REVIEW) report is not an approved record and must not be counted.
  const draft = await createReport(db, ctxA, { reportDate: "2026-07-21" });
  const draftRev = await addRevision(db, ctxA, {
    reportId: draft.id, structuredData: empty("99"), isAiGenerated: true,
  });
  await setCurrentRevision(db, ctxA, draft.id, draftRev.id);
  await setReportStatus(db, ctxA, draft.id, "PROCESSING");
  await setReportStatus(db, ctxA, draft.id, "AWAITING_REVIEW");

  const toDate = await listApprovedReportRevisions(db, ctxA, "p1", { onOrBeforeDate: "2026-07-20" });
  expect(toDate.map((r) => r.reportDate)).toEqual(["2026-07-18", "2026-07-20"]);

  const earlier = await listApprovedReportRevisions(db, ctxA, "p1", { onOrBeforeDate: "2026-07-19" });
  expect(earlier.map((r) => r.reportDate)).toEqual(["2026-07-18"]);

  const oneDay = await listApprovedReportRevisions(db, ctxA, "p1", { onDate: "2026-07-20" });
  expect(oneDay).toHaveLength(1);
  expect((oneDay[0].structuredData as DprStructuredData).work_items[0].quantity.value).toBe("3");

  expect(await listApprovedReportRevisions(db, ctxB, "p1")).toHaveLength(0);
});

test("certified measurements exclude uncertified and superseded entries", async () => {
  const db = await createTestDb();
  const base = {
    projectId: "p1", unit: "cum", formula: "L×B×D", activityId: "act-rcc",
  };
  const certified = await addMbEntry(db, ctxA, {
    ...base, description: "Footing F1", measurementDate: "2026-07-18", quantity: "4",
  });
  await updateMbEntry(db, ctxA, certified.id, { status: "certified" });

  // Draft entry: measured but not certified, so it is not a certified quantity.
  await addMbEntry(db, ctxA, {
    ...base, description: "Footing F2", measurementDate: "2026-07-19", quantity: "7",
  });

  // Corrected entry: the certified original gains superseded_by and must not be counted
  // alongside its replacement.
  const original = await addMbEntry(db, ctxA, {
    ...base, description: "Footing F3", measurementDate: "2026-07-19", quantity: "5",
  });
  const correction = await addMbEntry(db, ctxA, {
    ...base, description: "Footing F3 (corrected)", measurementDate: "2026-07-19",
    quantity: "6", correctsEntryId: original.id,
  });
  await updateMbEntry(db, ctxA, original.id, { status: "certified", supersededBy: correction.id });
  await updateMbEntry(db, ctxA, correction.id, { status: "certified" });

  const rows = await listCertifiedMeasurements(db, ctxA, "p1", { onOrBeforeDate: "2026-07-20" });
  expect(rows.map((r) => r.quantity)).toEqual(["4", "6"]);

  const upTo18 = await listCertifiedMeasurements(db, ctxA, "p1", { onOrBeforeDate: "2026-07-18" });
  expect(upTo18.map((r) => r.quantity)).toEqual(["4"]);

  expect(await listCertifiedMeasurements(db, ctxB, "p1")).toHaveLength(0);
});

test("attendance on a date returns that date only, tenant-scoped", async () => {
  const db = await createTestDb();
  await addAttendance(db, ctxA, { projectId: "p1", attendanceDate: "2026-07-20", trade: "mason", headcount: 6 });
  await addAttendance(db, ctxA, { projectId: "p1", attendanceDate: "2026-07-20", trade: "helper", headcount: 4 });
  await addAttendance(db, ctxA, { projectId: "p1", attendanceDate: "2026-07-19", trade: "mason", headcount: 8 });

  const rows = await listAttendanceOnDate(db, ctxA, "p1", "2026-07-20");
  expect(rows.map((r) => [r.trade, r.headcount])).toEqual([["helper", 4], ["mason", 6]]);
  expect(await listAttendanceOnDate(db, ctxB, "p1", "2026-07-20")).toHaveLength(0);
});
