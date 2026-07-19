import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../client";
import { seed, SEED } from "../seed";
import { providerRunHealth, sweepStuckProcessing } from "./operations";
import { capabilitiesForRole } from "@buildflow/domain/tenancy";

test("stuck processing sweeper fails safely and writes a content-free audit event", async () => {
  const db = await createTestDb();
  await seed(db);
  await db.execute(sql`insert into daily_report
    (id, organization_id, project_id, report_date, status, created_by, updated_at)
    values ('stuck-report', ${SEED.orgId}, ${SEED.projectId}, '2026-07-18', 'PROCESSING',
      ${SEED.engineer.id}, '2026-07-19T09:00:00Z')`);
  expect(await sweepStuckProcessing(db, 15, new Date("2026-07-19T10:00:00Z"))).toBe(1);
  const report = (await db.execute(sql`select status from daily_report where id = 'stuck-report'`)) as unknown as { rows: { status: string }[] };
  expect(report.rows[0].status).toBe("PROCESSING_FAILED");
  const audit = (await db.execute(sql`select action, metadata from audit_event where subject_ref = 'stuck-report'`)) as unknown as { rows: { action: string; metadata: Record<string, unknown> }[] };
  expect(audit.rows[0]).toEqual({ action: "report.processing_timed_out", metadata: { timeoutMinutes: 15 } });
});

test("provider health uses processing start time and exposes aggregates only", async () => {
  const db = await createTestDb();
  await seed(db);
  await db.execute(sql`insert into processing_run
    (id, organization_id, report_id, status, provider, model, started_at, finished_at)
    values ('run-health', ${SEED.orgId}, 'report-health', 'succeeded', 'mock', 'deterministic',
      '2026-07-19T10:00:00Z', '2026-07-19T10:00:02Z')`);
  const rows = await providerRunHealth(db, {
    organizationId: SEED.orgId, userId: SEED.owner.id, capabilities: capabilitiesForRole("org_owner"),
  });
  expect(rows).toEqual([{ provider: "mock", model: "deterministic", total: 1, succeeded: 1, failed: 0, averageDurationMs: 2_000 }]);
});
