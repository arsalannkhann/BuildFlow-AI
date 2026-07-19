import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { createProject } from "@buildflow/db/queries/projects";
import { createReport } from "@buildflow/db/queries/reports";
import { portfolioOverview } from "./portfolio-core";
import { createScheduleItem, raiseBlocker, reviseScheduleDates } from "./controls-core";
import { createMaterial, recordStockMovement } from "./materials-core";

const TODAY = "2026-07-19";

async function setup() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-pf-"));
  const db = await createTestDb();
  await seed(db);
  const owner = await resolveTenantContext(db, SEED.owner.id, SEED.projectId);
  const eng = await resolveTenantContext(db, SEED.engineer.id, SEED.projectId);
  return { db, owner, eng };
}

test("aggregates exceptions across projects from existing records", async () => {
  const { db, owner, eng } = await setup();

  // Late schedule item + overdue critical blocker + shortage on the seeded project.
  const itemId = await createScheduleItem(db, owner, {
    projectId: SEED.projectId, name: "Basement slab", baselineEnd: "2026-07-01",
  });
  await reviseScheduleDates(db, owner, itemId, { currentEnd: "2026-07-10", status: "in_progress" });
  await raiseBlocker(db, owner, {
    projectId: SEED.projectId, title: "RCC drawings pending", severity: "critical", dueDate: "2026-07-15",
  });
  const materialId = await createMaterial(db, eng, { name: "Cement", unit: "bag", reorderThreshold: "100" });
  await recordStockMovement(db, eng, { projectId: SEED.projectId, materialId, kind: "received", quantity: "40" });
  // A report today on the seeded project; the second project stays silent.
  await createReport(db, { ...owner, projectId: SEED.projectId }, { reportDate: TODAY });
  await createProject(db, owner, { name: "Tower B" });

  const portfolio = await portfolioOverview(db, owner, TODAY);
  expect(portfolio.projects).toHaveLength(2); // org-wide membership sees everything
  const [towerA, towerB] = [
    portfolio.projects.find((p) => p.project.id === SEED.projectId)!,
    portfolio.projects.find((p) => p.project.name === "Tower B")!,
  ];
  expect(towerA.missingToday).toBe(false);
  expect(towerB.missingToday).toBe(true);
  expect(portfolio.totals.missingToday).toBe(1);
  expect(towerA.delayIndicators).toHaveLength(1);
  expect(towerA.delayIndicators[0].explanation).toContain("2026-07-10"); // explainable, record-backed
  expect(towerA.criticalOpenBlockers).toBe(1);
  expect(towerA.overdueBlockers).toBe(1);
  expect(towerA.shortages.map((s) => s.name)).toEqual(["Cement"]);
  // Materials are org-level (Phase D): Tower B holds zero stock of Cement, so it is
  // below threshold there too — the total counts both projects' alerts.
  expect(towerB.shortages.map((s) => s.currentStock)).toEqual(["0"]);
  expect(portfolio.totals.shortages).toBe(2);
  expect(portfolio.jobs.dead).toBe(0);

  // Owner holds budget.read -> org budget rollup present (zeroes without a budget).
  expect(portfolio.totals.budget).not.toBeNull();
});

test("membership scoping: a project-scoped user sees only their projects; budget tile follows budget.read", async () => {
  const { db, owner, eng } = await setup();
  await createProject(db, owner, { name: "Tower B" });

  const portfolio = await portfolioOverview(db, eng, TODAY);
  expect(portfolio.projects.map((p) => p.project.id)).toEqual([SEED.projectId]);
  // site_engineer lacks budget.read: no budget numbers anywhere.
  expect(portfolio.canSeeBudget).toBe(false);
  expect(portfolio.totals.budget).toBeNull();
  expect(portfolio.projects[0].budget).toBeNull();

  // Someone without project.read is refused outright.
  await expect(portfolioOverview(db, { ...eng, capabilities: [] }, TODAY))
    .rejects.toThrow(/not permitted/i);
});
