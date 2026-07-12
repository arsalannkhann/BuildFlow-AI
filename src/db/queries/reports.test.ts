import { expect, test } from "vitest";
import { createTestDb } from "@/db/client";
import { createReport, getReport, setReportStatus, listReports } from "./reports";
import type { TenantContext } from "@/domain/tenancy";

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
