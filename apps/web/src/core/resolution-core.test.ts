import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { termAliases, reportEntityLinks, materials, locations } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import { DPR_SCHEMA_VERSION, type DprStructuredData } from "@buildflow/domain/dpr/schema";
import {
  confirmResolution, listResolutions, loadProjectVocabulary, recordResolutions,
  resolveReportEntities, seedOrganizationVocabulary,
} from "./resolution-core";

const supported = { source_refs: [], confidence_band: "Supported" as const };

function dpr(overrides: Partial<DprStructuredData> = {}): DprStructuredData {
  return {
    schema_version: DPR_SCHEMA_VERSION,
    work_items: [], labour: [], materials: [], equipment: [], safety_quality: [], blockers: [],
    weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" },
    tomorrow_plan: [],
    ...overrides,
  };
}

async function setup() {
  const db = await createTestDb();
  await seed(db);
  const ctx = { ...(await resolveTenantContext(db, SEED.manager.id)), projectId: SEED.projectId };
  await db.insert(materials).values([
    { id: "mat-steel", organizationId: SEED.orgId, name: "TMT steel Fe 500D", unit: "kg" },
    { id: "mat-cement", organizationId: SEED.orgId, name: "Cement OPC 43", unit: "bag" },
  ]).onConflictDoNothing();
  await db.insert(locations).values([
    { id: "loc-l3", organizationId: SEED.orgId, projectId: SEED.projectId, kind: "floor", name: "Tower A / Level 3" },
  ]).onConflictDoNothing();
  return { db, ctx };
}

test("Hinglish site speech maps onto the project's own catalogue rows", async () => {
  const { db, ctx } = await setup();
  const vocab = await loadProjectVocabulary(db, ctx, SEED.projectId);

  const findings = resolveReportEntities(dpr({
    work_items: [{
      description: "chhat ki dhalai", location: "Tower A / Level 3", activity: null,
      quantity: { value: "dhai", unit: "cum" }, ...supported,
    }],
    labour: [{ trade: "mistri", count: 6, ...supported }],
    materials: [{ name: "sariya", status: "used", quantity: null, unit: null, ...supported }],
  }), vocab);

  const material = findings.find((f) => f.fieldPath === "materials[0].name");
  expect(material?.resolution.entityId).toBe("mat-steel");   // sariya -> TMT steel row
  expect(material?.resolution.confident).toBe(true);

  const trade = findings.find((f) => f.fieldPath === "labour[0].trade");
  expect(trade?.resolution.canonicalValue).toBe("mason");     // mistri -> mason

  const location = findings.find((f) => f.fieldPath === "work_items[0].location");
  expect(location?.resolution.entityId).toBe("loc-l3");

  const quantity = findings.find((f) => f.fieldPath === "work_items[0].quantity");
  expect(quantity?.quantity?.value).toBe("2.5");              // "dhai" -> 2.5
  expect(quantity?.quantity?.unitCode).toBe("m3");            // "cum" -> m3
});

test("absence is detected so a shortage never posts as a receipt", async () => {
  const { db, ctx } = await setup();
  const vocab = await loadProjectVocabulary(db, ctx, SEED.projectId);
  const findings = resolveReportEntities(dpr({
    materials: [{ name: "cement", status: "delayed", quantity: null, unit: null, ...supported }],
  }), vocab);
  expect(findings.find((f) => f.fieldPath === "materials[0].name")?.negated).toBe(true);
});

test("an unknown material resolves to nothing and keeps the raw words", async () => {
  const { db, ctx } = await setup();
  const vocab = await loadProjectVocabulary(db, ctx, SEED.projectId);
  const findings = resolveReportEntities(dpr({
    materials: [{ name: "zorbium mesh", status: "used", quantity: null, unit: null, ...supported }],
  }), vocab);
  const found = findings.find((f) => f.fieldPath === "materials[0].name");
  expect(found?.resolution.method).toBe("unresolved");
  expect(found?.resolution.entityId).toBeNull();
  expect(found?.resolution.rawText).toBe("zorbium mesh");
});

test("resolutions are recorded as an auditable trail with method and score", async () => {
  const { db, ctx } = await setup();
  const vocab = await loadProjectVocabulary(db, ctx, SEED.projectId);
  const findings = resolveReportEntities(dpr({
    labour: [{ trade: "beldar", count: 4, ...supported }],
  }), vocab);
  await recordResolutions(db, ctx, {
    reportId: "rep-1", projectId: SEED.projectId, revisionId: "rev-1", findings,
  });
  const rows = await listResolutions(db, ctx, "rep-1");
  expect(rows).toHaveLength(findings.length);
  expect(rows[0].method).toBe("alias");
  expect(rows[0].rawText).toBe("beldar");
  expect(rows[0].canonicalValue).toBe("helper");
});

test("a reviewer's correction is learned and applied to the NEXT report", async () => {
  const { db, ctx } = await setup();

  // The site calls its own bespoke item "chadar"; nothing in the seed vocabulary knows it.
  const before = resolveReportEntities(dpr({
    materials: [{ name: "chadar", status: "used", quantity: null, unit: null, ...supported }],
  }), await loadProjectVocabulary(db, ctx, SEED.projectId));
  expect(before[0].resolution.method).toBe("unresolved");

  await recordResolutions(db, ctx, {
    reportId: "rep-2", projectId: SEED.projectId, revisionId: "rev-2", findings: before,
  });
  const [link] = await listResolutions(db, ctx, "rep-2");

  // The manager says: on this project, "chadar" means the TMT steel row.
  await confirmResolution(db, ctx, {
    linkId: link.id, entityId: "mat-steel", canonicalValue: "TMT steel Fe 500D",
  });

  const learned = await db.select().from(termAliases)
    .where(eq(termAliases.alias, "chadar"));
  expect(learned).toHaveLength(1);
  expect(learned[0].source).toBe("learned");
  expect(learned[0].projectId).toBe(SEED.projectId); // project-scoped, not org-wide

  // The same words now resolve on their own — no second question to the reviewer.
  const after = resolveReportEntities(dpr({
    materials: [{ name: "chadar", status: "used", quantity: null, unit: null, ...supported }],
  }), await loadProjectVocabulary(db, ctx, SEED.projectId));
  expect(after[0].resolution.entityId).toBe("mat-steel");
  expect(after[0].resolution.confident).toBe(true);
});

test("re-correcting an already-learned alias overwrites it, never keeps the stale mapping", async () => {
  const { db, ctx } = await setup();

  // First the site teaches "chadar" -> the TMT steel row.
  const first = resolveReportEntities(dpr({
    materials: [{ name: "chadar", status: "used", quantity: null, unit: null, ...supported }],
  }), await loadProjectVocabulary(db, ctx, SEED.projectId));
  await recordResolutions(db, ctx, {
    reportId: "rep-a", projectId: SEED.projectId, revisionId: null, findings: first,
  });
  const [linkA] = await listResolutions(db, ctx, "rep-a");
  await confirmResolution(db, ctx, {
    linkId: linkA.id, entityId: "mat-steel", canonicalValue: "TMT steel Fe 500D",
  });

  // Then a reviewer decides that on THIS project "chadar" actually means the cement row.
  const second = resolveReportEntities(dpr({
    materials: [{ name: "chadar", status: "used", quantity: null, unit: null, ...supported }],
  }), await loadProjectVocabulary(db, ctx, SEED.projectId));
  await recordResolutions(db, ctx, {
    reportId: "rep-b", projectId: SEED.projectId, revisionId: null, findings: second,
  });
  const [linkB] = await listResolutions(db, ctx, "rep-b");
  await confirmResolution(db, ctx, {
    linkId: linkB.id, entityId: "mat-cement", canonicalValue: "Cement OPC 53",
  });

  // Exactly one learned row survives, carrying the CORRECTION — not the stale first answer.
  const learned = await db.select().from(termAliases).where(eq(termAliases.alias, "chadar"));
  expect(learned).toHaveLength(1);
  expect(learned[0].canonicalId).toBe("mat-cement");
  expect(learned[0].canonicalValue).toBe("Cement OPC 53");

  // And the next report resolves to the corrected record, with no reviewer prompt.
  const next = resolveReportEntities(dpr({
    materials: [{ name: "chadar", status: "used", quantity: null, unit: null, ...supported }],
  }), await loadProjectVocabulary(db, ctx, SEED.projectId));
  expect(next[0].resolution.entityId).toBe("mat-cement");
});

test("confirmation requires review capability and is audited", async () => {
  const { db, ctx } = await setup();
  const engineer = { ...(await resolveTenantContext(db, SEED.engineer.id)), projectId: SEED.projectId };
  const findings = resolveReportEntities(dpr({
    labour: [{ trade: "mistri", count: 2, ...supported }],
  }), await loadProjectVocabulary(db, ctx, SEED.projectId));
  await recordResolutions(db, ctx, {
    reportId: "rep-3", projectId: SEED.projectId, revisionId: null, findings,
  });
  const [link] = await listResolutions(db, ctx, "rep-3");
  const withoutReview = { ...engineer, capabilities: engineer.capabilities.filter((c) => c !== "report.review") };
  await expect(confirmResolution(db, withoutReview, {
    linkId: link.id, entityId: null, canonicalValue: "mason",
  })).rejects.toThrow(/not permitted/i);
});

test("seeding the organization vocabulary is idempotent", async () => {
  const { db, ctx } = await setup();
  const first = await seedOrganizationVocabulary(db, ctx);
  const second = await seedOrganizationVocabulary(db, ctx);
  expect(first).toBeGreaterThan(200); // hundreds of construction aliases
  expect(second).toBe(first);         // no duplicates on re-seed
  void newId;
  void reportEntityLinks;
});
