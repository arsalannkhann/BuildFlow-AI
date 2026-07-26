import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { blockers } from "@buildflow/db/schema";
import { resolveTenantContext } from "@buildflow/auth/context";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { DPR_SCHEMA_VERSION, type DprStructuredData } from "@buildflow/domain/dpr/schema";
import { createReport, setCurrentRevision, setReportStatus } from "@buildflow/db/queries/reports";
import { addRevision } from "@buildflow/db/queries/revisions";
import { addActivity } from "@buildflow/db/queries/reference";
import { addMbEntry, updateMbEntry } from "@buildflow/db/queries/mb";
import {
  createScheduleItem, linkApprovedReport, raiseBlocker, recordProgress, resolveBlocker,
} from "./controls-core";
import { recordAttendance } from "./labour-core";
import { buildProductivity, quantityPerHead, reportingDepth } from "./reporting-core";

type Db = Awaited<ReturnType<typeof createTestDb>>;
type WorkItem = { activity: string | null; value: string | null; unit: string | null };

async function setup() {
  const db = await createTestDb();
  await seed(db);
  const mgr = await resolveTenantContext(db, SEED.manager.id);
  return { db, mgr };
}

const dataWith = (items: WorkItem[]): DprStructuredData => ({
  schema_version: DPR_SCHEMA_VERSION,
  work_items: items.map((i, index) => ({
    description: `Work ${index + 1}`, location: null, activity: i.activity,
    quantity: { value: i.value, unit: i.unit },
    source_refs: [], confidence_band: "Supported" as const,
  })),
  labour: [], materials: [], equipment: [], safety_quality: [], blockers: [], tomorrow_plan: [],
  weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" },
});

/** Creates an APPROVED report with exactly the work items a test needs. */
async function approvedReport(db: Db, ctx: TenantContext, date: string, items: WorkItem[]) {
  const report = await createReport(db, ctx, { reportDate: date });
  const rev = await addRevision(db, ctx, {
    reportId: report.id, structuredData: dataWith(items), isAiGenerated: true,
    summaryClientSafe: "Client-safe summary.", summaryInternal: "Internal note.",
  });
  await setCurrentRevision(db, ctx, report.id, rev.id);
  await setReportStatus(db, ctx, report.id, "PROCESSING");
  await setReportStatus(db, ctx, report.id, "AWAITING_REVIEW");
  await setReportStatus(db, ctx, report.id, "APPROVED");
  return report.id;
}

async function rccSchedule(db: Db, mgr: TenantContext) {
  const activity = await addActivity(db, mgr, { projectId: SEED.projectId, name: "RCC", unit: "cum" });
  const scheduleItemId = await createScheduleItem(db, mgr, {
    projectId: SEED.projectId, name: "Third floor slab", activityId: activity.id,
    baselineStart: "2026-07-01", baselineEnd: "2026-07-15",
  });
  return { activityId: activity.id, scheduleItemId };
}

test("today, cumulative and certified are separate sums of stored rows", async () => {
  const { db, mgr } = await setup();
  const { activityId, scheduleItemId } = await rccSchedule(db, mgr);

  const earlier = await approvedReport(db, mgr, "2026-07-18", [{ activity: "RCC", value: "3", unit: "cum" }]);
  const subject = await approvedReport(db, mgr, "2026-07-20", [{ activity: "RCC", value: "2.5", unit: "cum" }]);
  for (const reportId of [earlier, subject]) {
    await linkApprovedReport(db, mgr, { projectId: SEED.projectId, reportId, scheduleItemId });
  }

  // A certified Measurement Book quantity is a MEASUREMENT, reported beside the stated
  // quantities rather than added to them.
  const entry = await addMbEntry(db, mgr, {
    projectId: SEED.projectId, description: "Slab S3", measurementDate: "2026-07-19",
    unit: "cum", quantity: "8", formula: "L×B×D", activityId,
  });
  await updateMbEntry(db, mgr, entry.id, { status: "certified" });

  const depth = await reportingDepth(db, mgr, subject);
  expect(depth.activityProgress).toHaveLength(1);
  const row = depth.activityProgress[0];
  expect(row.name).toBe("Third floor slab");
  expect(row.activityName).toBe("RCC");
  expect(row.baselineWindow).toBe("2026-07-01 → 2026-07-15");
  expect([row.today.value, row.today.unit]).toEqual(["2.5", "cum"]);
  expect([row.cumulative.value, row.cumulative.unit]).toEqual(["5.5", "cum"]);
  expect(row.cumulative.basis).toMatch(/from 2 approved report\(s\)/);
  expect([row.certified.value, row.certified.unit]).toEqual(["8", "cum"]);
  expect(row.certified.basis).toMatch(/MB entry #1/);
});

test("planned quantity stays unknown because no stored row carries one", async () => {
  const { db, mgr } = await setup();
  const { scheduleItemId } = await rccSchedule(db, mgr);
  const subject = await approvedReport(db, mgr, "2026-07-20", [{ activity: "RCC", value: "2.5", unit: "cum" }]);
  await linkApprovedReport(db, mgr, { projectId: SEED.projectId, reportId: subject, scheduleItemId });

  const [row] = (await reportingDepth(db, mgr, subject)).activityProgress;
  expect(row.planned.value).toBeNull();
  expect(row.planned.basis).toMatch(/no planned or baseline quantity is stored/i);
  // The baseline DATES are stored, so those are reported.
  expect(row.baselineWindow).toBe("2026-07-01 → 2026-07-15");
});

test("no progress update means no percentage — a 0 default is never printed as progress", async () => {
  const { db, mgr } = await setup();
  const { scheduleItemId } = await rccSchedule(db, mgr);
  const evidence = await approvedReport(db, mgr, "2026-07-20", [{ activity: "RCC", value: "2.5", unit: "cum" }]);
  await linkApprovedReport(db, mgr, { projectId: SEED.projectId, reportId: evidence, scheduleItemId });

  const before = (await reportingDepth(db, mgr, evidence)).activityProgress[0];
  expect(before.progressPercent).toBeNull();
  expect(before.progressBasis).toMatch(/no progress update has been recorded/i);

  await recordProgress(db, mgr, {
    projectId: SEED.projectId, scheduleItemId, percent: 40, evidenceReportId: evidence,
  });
  const after = (await reportingDepth(db, mgr, evidence)).activityProgress[0];
  expect(after.progressPercent).toBe(40);
  expect(after.progressBasis).toMatch(/manually recorded \d{4}-\d{2}-\d{2}/);
  expect(after.progressBasis).toMatch(/citing approved report 2026-07-20/);
});

test("a later approved report never leaks into an earlier report's cumulative", async () => {
  const { db, mgr } = await setup();
  const { scheduleItemId } = await rccSchedule(db, mgr);
  const subject = await approvedReport(db, mgr, "2026-07-20", [{ activity: "RCC", value: "2.5", unit: "cum" }]);
  const later = await approvedReport(db, mgr, "2026-07-22", [{ activity: "RCC", value: "10", unit: "cum" }]);
  for (const reportId of [subject, later]) {
    await linkApprovedReport(db, mgr, { projectId: SEED.projectId, reportId, scheduleItemId });
  }

  expect((await reportingDepth(db, mgr, subject)).activityProgress[0].cumulative.value).toBe("2.5");
  expect((await reportingDepth(db, mgr, later)).activityProgress[0].cumulative.value).toBe("12.5");
});

test("a work item with no quantity does not become a zero, and mixed units are refused", async () => {
  const { db, mgr } = await setup();
  const { scheduleItemId } = await rccSchedule(db, mgr);

  const unmeasured = await approvedReport(db, mgr, "2026-07-20", [{ activity: "RCC", value: null, unit: "cum" }]);
  await linkApprovedReport(db, mgr, { projectId: SEED.projectId, reportId: unmeasured, scheduleItemId });
  const noNumber = (await reportingDepth(db, mgr, unmeasured)).activityProgress[0];
  expect(noNumber.today.value).toBeNull();
  expect(noNumber.today.basis).toMatch(/none carrying a numeric quantity/i);

  const mixed = await approvedReport(db, mgr, "2026-07-21", [
    { activity: "RCC", value: "2.5", unit: "cum" },
    { activity: "RCC", value: "3", unit: "sqm" },
  ]);
  await linkApprovedReport(db, mgr, { projectId: SEED.projectId, reportId: mixed, scheduleItemId });
  const mixedRow = (await reportingDepth(db, mgr, mixed)).activityProgress[0];
  expect(mixedRow.today.value).toBeNull();
  expect(mixedRow.today.basis).toMatch(/different units \(cum, sqm\)/);
});

test("a link naming one work item attributes only that item", async () => {
  const { db, mgr } = await setup();
  const { scheduleItemId } = await rccSchedule(db, mgr);
  const subject = await approvedReport(db, mgr, "2026-07-20", [
    { activity: "RCC", value: "2.5", unit: "cum" },
    { activity: "RCC", value: "4", unit: "cum" },
  ]);
  await linkApprovedReport(db, mgr, {
    projectId: SEED.projectId, reportId: subject, scheduleItemId, workItemIndex: 1,
  });

  const row = (await reportingDepth(db, mgr, subject)).activityProgress[0];
  expect(row.today.value).toBe("4");
  expect(row.today.basis).toMatch(/work item\(s\) #2/);
});

test("an unlinked report reports no activities rather than guessing at them", async () => {
  const { db, mgr } = await setup();
  await rccSchedule(db, mgr);
  const subject = await approvedReport(db, mgr, "2026-07-20", [{ activity: "RCC", value: "2.5", unit: "cum" }]);
  expect((await reportingDepth(db, mgr, subject)).activityProgress).toEqual([]);
});

test("blocker age counts days from when it was raised, as at the report date", async () => {
  const { db, mgr } = await setup();
  const subject = await approvedReport(db, mgr, "2026-07-20", []);

  const open = await raiseBlocker(db, mgr, {
    projectId: SEED.projectId, title: "Waterproofing membrane not delivered",
    severity: "high", ownerName: "Procurement", dueDate: "2026-07-15",
  });
  const closed = await raiseBlocker(db, mgr, {
    projectId: SEED.projectId, title: "Water tanker not available", severity: "low",
  });
  const future = await raiseBlocker(db, mgr, {
    projectId: SEED.projectId, title: "Raised after this report date", severity: "low",
  });
  // Blockers are raised "now"; the document is dated. Backdate the stored rows so the
  // age arithmetic is asserted against fixed dates rather than the clock.
  await db.update(blockers).set({ createdAt: new Date("2026-07-08T04:00:00Z") })
    .where(eq(blockers.id, open));
  await db.update(blockers).set({ createdAt: new Date("2026-07-10T04:00:00Z") })
    .where(eq(blockers.id, closed));
  await db.update(blockers).set({ createdAt: new Date("2026-07-25T04:00:00Z") })
    .where(eq(blockers.id, future));
  await resolveBlocker(db, mgr, closed, "Tanker arranged");

  const tracked = (await reportingDepth(db, mgr, subject)).trackedBlockers;
  expect(tracked).toHaveLength(1); // resolved dropped; raised-later not yet in existence
  expect(tracked[0].title).toBe("Waterproofing membrane not delivered");
  expect(tracked[0].ageDays).toBe(12); // 2026-07-08 -> 2026-07-20
  expect(tracked[0].severity).toBe("high");
  expect(tracked[0].owner).toBe("Procurement");
  expect(tracked[0].dueDate).toBe("2026-07-15");
  expect(tracked[0].overdue).toBe(true);
});

test("productivity joins attendance headcount to approved quantities for the same date", async () => {
  const { db, mgr } = await setup();
  const subject = await approvedReport(db, mgr, "2026-07-20", [{ activity: "RCC", value: "2.5", unit: "cum" }]);
  await recordAttendance(db, mgr, {
    projectId: SEED.projectId, attendanceDate: "2026-07-20", trade: "mason", headcount: 6,
  });
  await recordAttendance(db, mgr, {
    projectId: SEED.projectId, attendanceDate: "2026-07-20", trade: "helper", headcount: 4,
  });

  const { productivity } = await reportingDepth(db, mgr, subject);
  expect(productivity.headcount).toBe(10);
  expect(productivity.headcountBasis).toBe("2 attendance record(s): helper 4, mason 6");
  expect(productivity.unavailableReason).toBeNull();
  expect(productivity.rows).toEqual([{
    unit: "cum", quantity: "2.5", perHead: "0.25",
    formula: "2.5 cum ÷ 10 workers = 0.25 cum per head",
  }]);
});

test("productivity refuses a ratio when either side of the join is missing", async () => {
  const { db, mgr } = await setup();

  // Quantities recorded, no attendance.
  const noAttendance = await approvedReport(db, mgr, "2026-07-20", [{ activity: "RCC", value: "2.5", unit: "cum" }]);
  const a = (await reportingDepth(db, mgr, noAttendance)).productivity;
  expect(a.rows).toEqual([]);
  expect(a.headcount).toBeNull();
  expect(a.unavailableReason).toMatch(/no labour attendance is recorded for 2026-07-20/);

  // Attendance recorded, no approved quantity.
  const noQuantity = await approvedReport(db, mgr, "2026-07-21", [{ activity: "RCC", value: null, unit: "cum" }]);
  await recordAttendance(db, mgr, {
    projectId: SEED.projectId, attendanceDate: "2026-07-21", trade: "mason", headcount: 5,
  });
  const b = (await reportingDepth(db, mgr, noQuantity)).productivity;
  expect(b.headcount).toBe(5);
  expect(b.rows).toEqual([]);
  expect(b.unavailableReason).toMatch(/no approved work item for 2026-07-21 carries a numeric quantity/);

  // Neither side present: both gaps are named.
  const neither = await approvedReport(db, mgr, "2026-07-22", []);
  const c = (await reportingDepth(db, mgr, neither)).productivity;
  expect(c.unavailableReason).toMatch(/no labour attendance is recorded.*and.*no approved work item/);
});

test("quantity per head is exact decimal arithmetic and marks rounded results", () => {
  expect(quantityPerHead("2.5", 10)).toEqual({ value: "0.25", exact: true });
  expect(quantityPerHead("12", 4)).toEqual({ value: "3", exact: true });
  // 10 / 3 cannot be written exactly: the value is rounded and the formula says "≈".
  expect(quantityPerHead("10", 3)).toEqual({ value: "3.333", exact: false });
  expect(quantityPerHead("0.001", 2)).toEqual({ value: "0.001", exact: false }); // half-up
  expect(() => quantityPerHead("2.5", 0)).toThrow(/positive whole number/i);
  expect(() => quantityPerHead("two", 2)).toThrow(/decimal/i);

  const rounded = buildProductivity({
    date: "2026-07-20", headcount: 3, headcountBasis: "1 attendance record(s): mason 3",
    approvedReportCount: 1, parts: [{ value: "10", unit: "cum" }],
  });
  expect(rounded.rows[0].formula).toBe("10 cum ÷ 3 workers ≈ 3.333 cum per head");
});

test("reportingDepth requires report.read", async () => {
  const { db, mgr } = await setup();
  const subject = await approvedReport(db, mgr, "2026-07-20", []);
  const stripped = { ...mgr, capabilities: mgr.capabilities.filter((c) => c !== "report.read") };
  await expect(reportingDepth(db, stripped, subject)).rejects.toThrow(/not permitted/i);
});
