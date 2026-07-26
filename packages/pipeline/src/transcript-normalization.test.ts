import { expect, test } from "vitest";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { createReport } from "@buildflow/db/queries/reports";
import { addRevision, getRevision } from "@buildflow/db/queries/revisions";
import { DPR_SCHEMA_VERSION, type DprStructuredData } from "@buildflow/domain/dpr/schema";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { getAiRegistry } from "@buildflow/ai/registry";
import type { TranscriptResult } from "@buildflow/ai/ports";
import { buildNormalizedTranscript, storeNormalizedTranscript } from "./transcript-normalization";

const ctx = (): TenantContext => ({
  organizationId: SEED.orgId, projectId: SEED.projectId, userId: SEED.engineer.id,
  capabilities: ["report.create", "report.review"],
});

const emptyDraft = (): DprStructuredData => ({
  schema_version: DPR_SCHEMA_VERSION,
  work_items: [], labour: [], materials: [], equipment: [], safety_quality: [], blockers: [],
  weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" },
  tomorrow_plan: [],
});

const hinglish: TranscriptResult = {
  text: "Cement NAHI aaya aaj, isliye chhat ki dhalai nahi ho payi.",
  language: "en-IN",
  segments: [{ text: "Cement NAHI aaya aaj", startMs: 0, endMs: 4000 }],
};

test("the normalized rendering is stored WITHOUT touching the original transcript", async () => {
  const db = await createTestDb();
  await seed(db);
  const report = await createReport(db, ctx(), { reportDate: "2026-07-20" });
  const revision = await addRevision(db, ctx(), {
    reportId: report.id, structuredData: emptyDraft(), isAiGenerated: true,
    transcript: hinglish,
  });

  const record = await buildNormalizedTranscript({ ai: getAiRegistry(), transcript: hinglish });
  expect(record).not.toBeNull();
  expect(record!.reason).toBe("code_mixed");
  expect(record!.provider).toBe("mock");
  await storeNormalizedTranscript(db, ctx(), revision.id, record!);

  const stored = await getRevision(db, ctx(), revision.id);
  // design.md §19: the original account is never replaced.
  expect(stored.transcript).toEqual(hinglish);
  expect((stored.transcript as TranscriptResult).text).toBe(hinglish.text);
  const normalized = stored.transcriptNormalized as { text: string; schema_version: string };
  expect(normalized.schema_version).toBe("transcript-normalized.v1");
  expect(normalized.text).toContain("Cement NAHI aaya");
});

test("an English transcript produces no rendering at all", async () => {
  const record = await buildNormalizedTranscript({
    ai: getAiRegistry(),
    transcript: {
      text: "Plaster work at level four was completed today.", language: "en-IN",
      segments: [],
    },
  });
  expect(record).toBeNull();
});
