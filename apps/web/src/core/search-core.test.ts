import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { upsertSearchDocument } from "@buildflow/db/queries/search";
import { deterministicEmbedding } from "@buildflow/ai/mock/embeddings";
import { finalizeReport, storeAttachmentContent, upsertReportManifest } from "./sync-core";
import { approveReport } from "@/app/actions/review-core";
import { raiseBlocker } from "./controls-core";
import { backfillSearchProjection, runSearch } from "./search-core";

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

async function setup() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-search-"));
  const db = await createTestDb();
  await seed(db);
  const eng = await resolveTenantContext(db, SEED.engineer.id, SEED.projectId);
  const mgr = await resolveTenantContext(db, SEED.manager.id, SEED.projectId);
  const owner = await resolveTenantContext(db, SEED.owner.id, SEED.projectId);
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  return { db, eng, mgr, owner, storage };
}

async function approvedReport(db: any, eng: any, mgr: any, storage: LocalFsStorage) {
  const audio = new TextEncoder().encode("audio-bytes");
  const manifest = await upsertReportManifest(db, eng, {
    clientReportId: "search-r1", projectId: SEED.projectId, reportDate: "2026-07-19",
    attachments: [{ clientAttachmentId: "a1", kind: "audio" as const, contentType: "audio/webm",
      byteSize: audio.byteLength, checksum: sha256(audio) }],
  });
  await storeAttachmentContent(db, storage, eng, manifest.reportId, manifest.attachments[0].attachmentId, audio);
  await finalizeReport(db, eng, manifest.reportId);
  await approveReport(db, mgr, manifest.reportId);
  return manifest.reportId;
}

test("approving a report projects it into search; drafts stay out until approved", async () => {
  const { db, eng, mgr, storage } = await setup();

  // Nothing searchable before approval.
  expect((await runSearch(db, mgr, { query: "cement" })).hits).toEqual([]);

  const reportId = await approvedReport(db, eng, mgr, storage);
  // The mock pipeline's summary mentions cement; the approval hook projected it.
  const result = await runSearch(db, mgr, { query: "cement" });
  expect(result.hits.length).toBe(1);
  expect(result.hits[0].kind).toBe("report");
  expect(result.hits[0].refId).toBe(reportId);
  expect(result.hits[0].approved).toBe(true);
  expect(result.hits[0].href).toBe(`/reports/${reportId}`);
  // PGlite mode: semantic ranking explicitly off (UI shows the PostgreSQL note).
  expect(result.semanticRankingActive).toBe(false);

  // Kind + project filters narrow correctly.
  expect((await runSearch(db, mgr, { query: "cement", kind: "invoice" })).hits).toEqual([]);
  expect((await runSearch(db, mgr, { query: "cement", projectId: SEED.projectId })).hits.length).toBe(1);
});

test("blockers project as working records with status distinction", async () => {
  const { db, mgr } = await setup();
  const blockerId = await raiseBlocker(db, mgr, {
    projectId: SEED.projectId, title: "Steel reinforcement shortage at gate", severity: "high",
  });
  const result = await runSearch(db, mgr, { query: "reinforcement shortage" });
  expect(result.hits.length).toBe(1);
  expect(result.hits[0].kind).toBe("blocker");
  expect(result.hits[0].refId).toBe(blockerId);
  expect(result.hits[0].approved).toBe(false); // open blocker = working record badge
});

test("tenant and membership scope filter before ranking; scope never widens", async () => {
  const { db, mgr, owner } = await setup();

  // A foreign org's document with a perfect keyword match must never surface.
  await db.execute(sql`insert into organization (id, name) values ('other-org', 'Other')`);
  const foreignCtx = { organizationId: "other-org", userId: "u2", capabilities: [] as never[] };
  await upsertSearchDocument(db, foreignCtx as any, {
    kind: "blocker", refId: "b-foreign", projectId: "p-foreign",
    title: "Cement cement cement", body: "cement", recordStatus: "open",
  });

  // An in-org document on a project the manager is NOT a member of.
  await db.execute(sql`insert into project (id, organization_id, name) values ('p2', ${SEED.orgId}, 'Tower B')`);
  await upsertSearchDocument(db, owner, {
    kind: "blocker", refId: "b-p2", projectId: "p2",
    title: "Cement pump failure", body: "cement pump", recordStatus: "open",
  });

  const mgrHits = (await runSearch(db, mgr, { query: "cement" })).hits;
  expect(mgrHits.map((h) => h.refId)).not.toContain("b-foreign");
  expect(mgrHits.map((h) => h.refId)).not.toContain("b-p2"); // membership filter

  // Asking for the out-of-scope project explicitly returns nothing (no widening).
  expect((await runSearch(db, mgr, { query: "cement", projectId: "p2" })).hits).toEqual([]);

  // The org-wide owner sees the p2 record but never the foreign org's.
  const ownerHits = (await runSearch(db, owner, { query: "cement" })).hits;
  expect(ownerHits.map((h) => h.refId)).toContain("b-p2");
  expect(ownerHits.map((h) => h.refId)).not.toContain("b-foreign");
});

test("backfill rebuilds the projection; embeddings are deterministic in mock mode", async () => {
  const { db, eng, mgr, owner, storage } = await setup();
  const reportId = await approvedReport(db, eng, mgr, storage);

  // Wipe the projection, then rebuild from source records (org.manage required).
  await db.execute(sql`delete from search_document`);
  await db.execute(sql`delete from search_embedding`);
  expect((await runSearch(db, mgr, { query: "cement" })).hits).toEqual([]);
  await expect(backfillSearchProjection(db, mgr)).rejects.toThrow(/not permitted/i);

  const count = await backfillSearchProjection(db, owner);
  expect(count).toBeGreaterThanOrEqual(1);
  const hits = (await runSearch(db, mgr, { query: "cement" })).hits;
  expect(hits.map((h) => h.refId)).toContain(reportId);

  // Embedding rows exist (stored even in PGlite; ranking with them is PG-only) and the
  // mock embedding is stable for identical input.
  const embRows = (await db.execute(sql`select model from search_embedding`)) as unknown as { rows: { model: string }[] };
  expect(embRows.rows.length).toBeGreaterThanOrEqual(1);
  expect(embRows.rows[0].model).toBe("mock-embedding-1");
  expect(deterministicEmbedding("same text")).toEqual(deterministicEmbedding("same text"));
  expect(deterministicEmbedding("same text")).not.toEqual(deterministicEmbedding("other text"));

  // The pgvector similarity SQL itself is valid (PGlite loads the extension too — the
  // DATABASE_URL guard in runSearch is a product decision, not a technical limit here).
  const { semanticSearchCandidates } = await import("@buildflow/db/queries/search");
  const doc = hits[0];
  const queryVector = deterministicEmbedding(`${doc.title}\n${doc.body}`.slice(0, 8000));
  const candidates = await semanticSearchCandidates(db, mgr, queryVector, { projectIds: [SEED.projectId] });
  expect(candidates.length).toBeGreaterThanOrEqual(1);
  expect(candidates[0].refId).toBe(reportId);
  expect(candidates[0].distance).toBeLessThan(1e-6); // identical text -> identical mock vector
});
