import { expect, test } from "vitest";
import { createTestDb } from "@/db/client";
import { createReport } from "./reports";
import { addRevision, getRevision } from "./revisions";
import { DPR_SCHEMA_VERSION, type DprStructuredData } from "@/domain/dpr/schema";
import type { TenantContext } from "@/domain/tenancy";

const ctx: TenantContext = { organizationId: "org-a", projectId: "p1", userId: "u1",
  capabilities: ["report.create"] };
const emptyDpr = { schema_version: DPR_SCHEMA_VERSION, work_items: [], labour: [], materials: [],
  equipment: [], safety_quality: [], blockers: [],
  weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" }, tomorrow_plan: [] } satisfies DprStructuredData;

test("revision numbers increment per report", async () => {
  const db = await createTestDb();
  const r = await createReport(db, ctx, { reportDate: "2026-07-13" });
  const rev1 = await addRevision(db, ctx, { reportId: r.id, structuredData: emptyDpr, isAiGenerated: true });
  const rev2 = await addRevision(db, ctx, { reportId: r.id, structuredData: emptyDpr, isAiGenerated: false });
  expect(rev1.revisionNumber).toBe(1);
  expect(rev2.revisionNumber).toBe(2);
  expect((await getRevision(db, ctx, rev2.id)).id).toBe(rev2.id);
});
