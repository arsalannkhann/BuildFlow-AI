import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../client";
import { seed, SEED } from "../seed";
import { dailyReports, reportRevisions } from "../schema";
import { searchApprovedReports } from "./search";

async function insertReport(db: Awaited<ReturnType<typeof createTestDb>>, input: {
  id: string; org?: string; status: string; text: string; date?: string;
}) {
  const org = input.org ?? SEED.orgId;
  await db.insert(dailyReports).values({
    id: input.id, organizationId: org, projectId: SEED.projectId,
    reportDate: input.date ?? "2026-07-19", status: input.status, createdBy: "u",
    currentRevisionId: `rev-${input.id}`,
  });
  await db.insert(reportRevisions).values({
    id: `rev-${input.id}`, organizationId: org, reportId: input.id, revisionNumber: 1,
    structuredData: {}, summaryInternal: input.text,
    transcript: { text: input.text }, createdBy: "u", isAiGenerated: true,
  });
}

test("search finds approved content, excludes drafts and other tenants, ranks matches", async () => {
  const db = await createTestDb();
  await seed(db);
  const ctx = { organizationId: SEED.orgId, userId: "u", capabilities: [] as never[] };

  await insertReport(db, { id: "r-appr", status: "APPROVED", text: "Cement delivery delayed by supplier strike" });
  await insertReport(db, { id: "r-draft", status: "AWAITING_REVIEW", text: "Cement quantities unclear" });
  await insertReport(db, { id: "r-issued", status: "ISSUED", text: "Slab casting completed with 40 bags cement" });
  await db.execute(sql`insert into organization (id, name) values ('other-org', 'Other')`);
  await insertReport(db, { id: "r-other", org: "other-org", status: "APPROVED", text: "Cement cement cement" });

  const hits = await searchApprovedReports(db, ctx, "cement");
  const ids = hits.map((h) => h.reportId);
  expect(ids).toContain("r-appr");
  expect(ids).toContain("r-issued");
  expect(ids).not.toContain("r-draft");   // drafts are never searchable
  expect(ids).not.toContain("r-other");   // tenant isolation before ranking

  expect(await searchApprovedReports(db, ctx, "helicopter")).toEqual([]);
  expect(await searchApprovedReports(db, ctx, "  ")).toEqual([]);
});
