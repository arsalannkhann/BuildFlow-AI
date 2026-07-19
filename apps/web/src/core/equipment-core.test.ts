import { expect, test } from "vitest";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { getEquipment, listAssignments, listEquipmentLogs } from "@buildflow/db/queries/equipment";
import {
  assignEquipment, logEquipmentUse, registerEquipment, scheduleService, serviceReminders, markServiceDone,
} from "./equipment-core";

async function setup() {
  const db = await createTestDb();
  await seed(db);
  const eng = await resolveTenantContext(db, SEED.engineer.id);
  const mgr = await resolveTenantContext(db, SEED.manager.id);
  return { db, eng, mgr };
}

test("register, assign, and append-only usage logs", async () => {
  const { db, eng, mgr } = await setup();
  const mixerId = await registerEquipment(db, eng, { name: "Concrete mixer 1", kind: "mixer", ownership: "owned" });
  await assignEquipment(db, eng, { projectId: SEED.projectId, equipmentId: mixerId, fromDate: "2026-07-01" });
  expect((await listAssignments(db, mgr, SEED.projectId)).length).toBe(1);

  await logEquipmentUse(db, eng, {
    projectId: SEED.projectId, equipmentId: mixerId, logDate: "2026-07-18", hoursUsed: "6.5", fuelLitres: "12",
  });
  // A correction is a NEW row, never an edit — both entries stay visible.
  await logEquipmentUse(db, eng, {
    projectId: SEED.projectId, equipmentId: mixerId, logDate: "2026-07-18",
    hoursUsed: "1.5", note: "Correction: evening pour",
  });
  const logs = await listEquipmentLogs(db, mgr, { equipmentId: mixerId });
  expect(logs).toHaveLength(2);

  await expect(assignEquipment(db, eng, {
    projectId: SEED.projectId, equipmentId: mixerId, fromDate: "2026-07-10", toDate: "2026-07-01",
  })).rejects.toThrow(/precede/i);

  const noEquip = { ...eng, capabilities: eng.capabilities.filter((c) => c !== "equipment.manage") };
  await expect(registerEquipment(db, noEquip, { name: "Crane" })).rejects.toThrow(/not permitted/i);
});

test("service reminders fire deterministically on date window OR cumulative hours", async () => {
  const { db, eng, mgr } = await setup();
  const mixerId = await registerEquipment(db, eng, { name: "Mixer", ownership: "rented" });
  const craneId = await registerEquipment(db, eng, { name: "Crane" });

  await scheduleService(db, eng, { equipmentId: mixerId, name: "Engine oil", dueDate: "2026-07-25" });
  await scheduleService(db, eng, { equipmentId: mixerId, name: "Drum bearing", dueDate: "2026-09-01" });
  await scheduleService(db, eng, { equipmentId: craneId, name: "Rope inspection", dueHours: "100" });

  // Date rule: 2026-07-25 is within 14 days of 2026-07-19; 2026-09-01 is not.
  let reminders = await serviceReminders(db, mgr, "2026-07-19", 14);
  expect(reminders.map((r) => r.serviceName)).toEqual(["Engine oil"]);
  expect(reminders[0].reason).toContain("2026-07-25");

  // Hours rule: 60 + 50 = 110 >= 100 triggers the crane reminder.
  await logEquipmentUse(db, eng, { projectId: SEED.projectId, equipmentId: craneId, logDate: "2026-07-10", hoursUsed: "60" });
  reminders = await serviceReminders(db, mgr, "2026-07-19", 14);
  expect(reminders.map((r) => r.serviceName)).toEqual(["Engine oil"]); // 60 < 100 — not yet
  await logEquipmentUse(db, eng, { projectId: SEED.projectId, equipmentId: craneId, logDate: "2026-07-18", hoursUsed: "50" });
  reminders = await serviceReminders(db, mgr, "2026-07-19", 14);
  expect(reminders.map((r) => r.serviceName).sort()).toEqual(["Engine oil", "Rope inspection"]);
  expect(reminders.find((r) => r.serviceName === "Rope inspection")?.reason)
    .toBe("110 logged hours have reached the 100-hour service interval");

  // Completed services stop reminding.
  const done = reminders.find((r) => r.serviceName === "Engine oil");
  await markServiceDone(db, eng, done?.serviceId ?? "", "Oil changed");
  reminders = await serviceReminders(db, mgr, "2026-07-19", 14);
  expect(reminders.map((r) => r.serviceName)).toEqual(["Rope inspection"]);
});

test("cross-tenant reads fail closed", async () => {
  const { db, eng, mgr } = await setup();
  const mixerId = await registerEquipment(db, eng, { name: "Mixer" });
  const foreign = { ...mgr, organizationId: "org-elsewhere" };
  expect(await getEquipment(db, foreign, mixerId)).toBeNull();
  expect(await listEquipmentLogs(db, foreign, { equipmentId: mixerId })).toEqual([]);
});
