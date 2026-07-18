import { expect, test } from "vitest";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { createReport, getReport, listReports, setReportStatus } from "@buildflow/db/queries/reports";
import type { TenantContext } from "@buildflow/domain/tenancy";

const orgB: TenantContext = { organizationId: "attacker-org", projectId: "x", userId: "attacker",
  capabilities: ["report.create", "report.review", "report.approve", "report.issue"] };

test("a fully-capable user of another org cannot read, list, or mutate org A's report", async () => {
  const db = await createTestDb();
  await seed(db);
  const owner: TenantContext = { organizationId: SEED.orgId, projectId: SEED.projectId,
    userId: SEED.engineer.id, capabilities: ["report.create"] };
  const report = await createReport(db, owner, { reportDate: "2026-07-13" });

  await expect(getReport(db, orgB, report.id)).rejects.toThrow(/not found/i);
  expect(await listReports(db, orgB)).toHaveLength(0);
  await expect(setReportStatus(db, orgB, report.id, "PROCESSING")).rejects.toThrow(/not found/i);
});
