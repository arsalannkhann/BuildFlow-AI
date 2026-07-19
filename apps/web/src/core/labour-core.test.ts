import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { getContractor, listAttendance } from "@buildflow/db/queries/labour";
import { addActivity } from "@buildflow/db/queries/reference";
import { submitReport } from "@/app/actions/capture-core";
import { approveReport } from "@/app/actions/review-core";
import { attendanceSummary, labourProductivity, recordAttendance, registerContractor } from "./labour-core";

async function setup() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-lab-"));
  const db = await createTestDb();
  await seed(db);
  const eng = await resolveTenantContext(db, SEED.engineer.id);
  const mgr = await resolveTenantContext(db, SEED.manager.id);
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  return { db, eng, mgr, storage };
}

test("attendance records daily totals only, summarized per day and trade", async () => {
  const { db, eng, mgr } = await setup();
  const contractorId = await registerContractor(db, eng, { name: "Sharma Constructions", trade: "civil" });
  expect((await getContractor(db, eng, contractorId))?.name).toBe("Sharma Constructions");

  await recordAttendance(db, eng, {
    projectId: SEED.projectId, attendanceDate: "2026-07-18", trade: "mason", headcount: 6,
    contractorId, hoursWorked: "48",
  });
  await recordAttendance(db, eng, {
    projectId: SEED.projectId, attendanceDate: "2026-07-18", trade: "helper", headcount: 4, hoursWorked: "32.5",
  });
  await recordAttendance(db, eng, {
    projectId: SEED.projectId, attendanceDate: "2026-07-19", trade: "mason", headcount: 8,
  });

  const summary = await attendanceSummary(db, mgr, SEED.projectId);
  expect(summary.map((d) => [d.date, d.totalHeadcount])).toEqual([["2026-07-19", 8], ["2026-07-18", 10]]);
  expect(summary[1].totalHours).toBe("80.5");
  expect(summary[1].byTrade).toEqual([{ trade: "helper", headcount: 4 }, { trade: "mason", headcount: 6 }]);

  // Validation: headcount is a positive whole number, no fractional people.
  await expect(recordAttendance(db, eng, {
    projectId: SEED.projectId, attendanceDate: "2026-07-19", trade: "mason", headcount: 0,
  })).rejects.toThrow(/positive whole number/i);
});

test("labour.manage is required to write; stripped context is denied", async () => {
  const { db, mgr } = await setup();
  const noLabour = { ...mgr, capabilities: mgr.capabilities.filter((c) => c !== "labour.manage") };
  await expect(registerContractor(db, noLabour, { name: "X" })).rejects.toThrow(/not permitted/i);
  await expect(recordAttendance(db, noLabour, {
    projectId: SEED.projectId, attendanceDate: "2026-07-18", trade: "mason", headcount: 5,
  })).rejects.toThrow(/not permitted/i);
});

test("productivity join matches attendance to APPROVED DPR quantities per activity/day", async () => {
  const { db, eng, mgr, storage } = await setup();
  // Mock extraction produces work item: activity "RCC", quantity 2.5 cum.
  const activity = await addActivity(db, mgr, { projectId: SEED.projectId, name: "RCC", unit: "cum" });
  const reportId = await submitReport(db, storage, eng, {
    reportDate: "2026-07-18", audio: { bytes: new TextEncoder().encode("a"), contentType: "audio/webm" }, photos: [],
  });
  await recordAttendance(db, eng, {
    projectId: SEED.projectId, attendanceDate: "2026-07-18", trade: "mason", headcount: 6,
    activityId: activity.id, hoursWorked: "48",
  });

  // Before approval the report contributes nothing.
  let rows = await labourProductivity(db, mgr, SEED.projectId);
  expect(rows).toHaveLength(1);
  expect(rows[0].approvedQuantities).toEqual([]);

  await approveReport(db, mgr, reportId);
  rows = await labourProductivity(db, mgr, SEED.projectId);
  expect(rows[0].activity).toBe("RCC");
  expect(rows[0].headcount).toBe(6);
  expect(rows[0].approvedQuantities).toEqual([{
    description: "Casting of column C4", value: "2.5", unit: "cum", reportId,
  }]);
});

test("cross-tenant reads fail closed", async () => {
  const { db, eng, mgr } = await setup();
  const contractorId = await registerContractor(db, eng, { name: "Sharma Constructions" });
  await recordAttendance(db, eng, {
    projectId: SEED.projectId, attendanceDate: "2026-07-18", trade: "mason", headcount: 5,
  });
  const foreign = { ...mgr, organizationId: "org-elsewhere" };
  expect(await getContractor(db, foreign, contractorId)).toBeNull();
  expect(await listAttendance(db, foreign, SEED.projectId)).toEqual([]);
});
