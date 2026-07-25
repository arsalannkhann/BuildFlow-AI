import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { newId } from "@buildflow/domain/ids";
import { reportEntityLinks, termAliases } from "@buildflow/db/schema";
import { listActivities, listLocations } from "@buildflow/db/queries/reference";
import { listMaterials } from "@buildflow/db/queries/materials";
import { listScheduleItems } from "@buildflow/db/queries/controls";
import { audit } from "@buildflow/db/queries/audit";
import type { DprStructuredData } from "@buildflow/domain/dpr/schema";
import {
  hasNegation, readQuantity, resolveTerm,
  type AliasEntry, type Candidate, type Resolution,
} from "@buildflow/domain/resolve";

/**
 * Application tier of entity resolution: loads the project's own vocabulary, runs the
 * deterministic cascade from @buildflow/domain/resolve, and records how every phrase was
 * mapped so the decision is auditable and correctable.
 *
 * The rules that protect the record (rules.md §11):
 *   - resolution NEVER edits a claim; it only attaches links and normalised readings
 *   - an unconfident mapping is stored as a SUGGESTION for the reviewer, not applied
 *   - a reviewer's correction is LEARNED as a project alias, so the same words resolve
 *     next time without asking — the accuracy of a project improves with its own history
 */

export type EntityKind = "location" | "activity" | "material" | "schedule_item" | "trade" | "unit";

export type FieldResolution = {
  fieldPath: string;
  entityKind: EntityKind;
  resolution: Resolution;
  /** Normalised quantity reading where the phrase carried one. */
  quantity?: { value: string | null; unitCode: string | null; unitUnknown: boolean };
  /** True when the phrase reads as an absence/shortage rather than a positive event. */
  negated?: boolean;
};

type ProjectVocabulary = {
  locations: Candidate[];
  activities: Candidate[];
  materials: Candidate[];
  scheduleItems: Candidate[];
  aliases: AliasEntry[];
};

/** Loads everything the cascade needs for one project in a single pass. */
export async function loadProjectVocabulary(
  db: AppDb, ctx: TenantContext, projectId: string,
): Promise<ProjectVocabulary> {
  const [locations, activities, materials, scheduleItems, aliasRows] = await Promise.all([
    listLocations(db, ctx, projectId).catch(() => []),
    listActivities(db, ctx, projectId).catch(() => []),
    listMaterials(db, ctx).catch(() => []),
    listScheduleItems(db, ctx, projectId).catch(() => []),
    db.select().from(termAliases).where(and(
      eq(termAliases.organizationId, ctx.organizationId),
      or(isNull(termAliases.projectId), eq(termAliases.projectId, projectId)),
    )).catch(() => []),
  ]);

  return {
    locations: locations.map((l) => ({ id: l.id, name: l.name, extra: l.kind })),
    activities: activities.map((a) => ({ id: a.id, name: a.name, extra: a.unit })),
    materials: materials.map((m) => ({ id: m.id, name: m.name, extra: m.unit })),
    scheduleItems: scheduleItems.map((s) => ({ id: s.id, name: s.name })),
    aliases: aliasRows.map((row) => ({
      kind: row.kind,
      alias: row.alias,
      canonicalValue: row.canonicalValue,
      canonicalId: row.canonicalId,
      projectScoped: row.projectId !== null,
    })),
  };
}

const recordsFor = (vocab: ProjectVocabulary, kind: EntityKind): Candidate[] => {
  switch (kind) {
    case "location": return vocab.locations;
    case "activity": return vocab.activities;
    case "material": return vocab.materials;
    case "schedule_item": return vocab.scheduleItems;
    default: return [];
  }
};

/** Maps our entity kinds onto the seeded vocabulary kinds. */
const vocabKindFor = (kind: EntityKind): string =>
  kind === "schedule_item" ? "activity" : kind;

/**
 * Resolves every referenceable phrase in an extracted DPR. Pure with respect to the report:
 * it returns findings and never mutates the structured data.
 */
export function resolveReportEntities(
  data: DprStructuredData, vocab: ProjectVocabulary,
): FieldResolution[] {
  const out: FieldResolution[] = [];
  const run = (phrase: string | null, kind: EntityKind, fieldPath: string) => {
    if (!phrase) return;
    const resolution = resolveTerm({
      phrase, kind: vocabKindFor(kind),
      records: recordsFor(vocab, kind), learned: vocab.aliases,
    });
    out.push({ fieldPath, entityKind: kind, resolution });
  };

  data.work_items.forEach((item, i) => {
    run(item.location, "location", `work_items[${i}].location`);
    run(item.activity ?? item.description, "activity", `work_items[${i}].activity`);
    // A work item's description often carries the reference to the planned activity.
    run(item.description, "schedule_item", `work_items[${i}].schedule_item`);
    const reading = readQuantity(
      [item.quantity.value, item.quantity.unit, item.description].filter(Boolean).join(" "));
    out.push({
      fieldPath: `work_items[${i}].quantity`, entityKind: "unit",
      resolution: {
        rawText: `${item.quantity.value ?? ""} ${item.quantity.unit ?? ""}`.trim(),
        method: reading.unit ? "alias" : "unresolved",
        canonicalValue: reading.unit?.code ?? null,
        entityId: null, score: reading.unit ? 1 : null, candidates: [],
        confident: Boolean(reading.unit),
      },
      quantity: {
        value: reading.value, unitCode: reading.unit?.code ?? null, unitUnknown: reading.unitUnknown,
      },
    });
  });

  data.labour.forEach((row, i) => run(row.trade, "trade", `labour[${i}].trade`));

  data.materials.forEach((row, i) => {
    const phrase = [row.name, row.status].filter(Boolean).join(" ");
    const resolution = resolveTerm({
      phrase: row.name, kind: "material",
      records: vocab.materials, learned: vocab.aliases,
    });
    out.push({
      fieldPath: `materials[${i}].name`, entityKind: "material", resolution,
      negated: hasNegation(phrase),
    });
  });

  data.equipment.forEach((row, i) => {
    const resolution = resolveTerm({
      phrase: row.name, kind: "equipment", records: [], learned: vocab.aliases,
    });
    out.push({ fieldPath: `equipment[${i}].name`, entityKind: "activity", resolution });
  });

  return out;
}

/**
 * Persists resolutions as an append-only trail. Confident mappings are stored as applied;
 * everything else is stored unconfirmed so the review screen can offer the shortlist.
 */
export async function recordResolutions(
  db: AppDb, ctx: TenantContext,
  input: { reportId: string; projectId: string; revisionId?: string | null; findings: FieldResolution[] },
): Promise<void> {
  if (input.findings.length === 0) return;
  await db.insert(reportEntityLinks).values(input.findings.map((finding) => ({
    id: newId(),
    organizationId: ctx.organizationId,
    projectId: input.projectId,
    reportId: input.reportId,
    revisionId: input.revisionId ?? null,
    fieldPath: finding.fieldPath,
    entityKind: finding.entityKind,
    entityId: finding.resolution.entityId,
    canonicalValue: finding.resolution.canonicalValue,
    rawText: finding.resolution.rawText,
    method: finding.resolution.method,
    score: finding.resolution.score === null ? null : finding.resolution.score.toFixed(4),
  })));
}

export async function listResolutions(db: AppDb, ctx: TenantContext, reportId: string) {
  return db.select().from(reportEntityLinks).where(and(
    eq(reportEntityLinks.organizationId, ctx.organizationId),
    eq(reportEntityLinks.reportId, reportId),
  ));
}

/**
 * A reviewer confirms (or corrects) a mapping. The correction is learned as a
 * PROJECT-scoped alias so identical words resolve automatically next time — this feedback
 * loop, not prompt tuning, is what makes resolution accurate for a specific site's dialect.
 */
export async function confirmResolution(
  db: AppDb, ctx: TenantContext,
  input: { linkId: string; entityId: string | null; canonicalValue: string | null; learn?: boolean },
): Promise<void> {
  assertCan(ctx, "report.review");
  const [link] = await db.select().from(reportEntityLinks).where(and(
    eq(reportEntityLinks.organizationId, ctx.organizationId),
    eq(reportEntityLinks.id, input.linkId),
  ));
  if (!link) throw new Error("Resolution not found");

  await db.update(reportEntityLinks).set({
    entityId: input.entityId,
    canonicalValue: input.canonicalValue,
    method: "manual",
    confirmedAt: new Date(),
    confirmedBy: ctx.userId,
  }).where(eq(reportEntityLinks.id, input.linkId));

  if (input.learn !== false && link.rawText.trim()) {
    const alias = link.rawText.trim().toLowerCase();
    await db.insert(termAliases).values({
      id: newId(),
      organizationId: ctx.organizationId,
      projectId: link.projectId,
      kind: link.entityKind === "schedule_item" ? "activity" : link.entityKind,
      alias,
      canonicalValue: input.canonicalValue ?? alias,
      canonicalId: input.entityId,
      source: "learned",
      confirmedBy: ctx.userId,
    }).onConflictDoNothing();
  }

  await audit(db, ctx, {
    action: "resolution.confirmed", subjectRef: link.reportId,
    metadata: { fieldPath: link.fieldPath, entityKind: link.entityKind, learned: input.learn !== false },
  });
}

/** Seeds the shared construction vocabulary for an organization (idempotent). */
export async function seedOrganizationVocabulary(
  db: AppDb, ctx: TenantContext,
): Promise<number> {
  const { vocabularySeeds } = await import("@buildflow/domain/resolve/vocabulary");
  const { unitAliasSeeds } = await import("@buildflow/domain/resolve/units");
  const rows = [
    ...vocabularySeeds().map((seed) => ({ kind: seed.kind, alias: seed.alias, canonicalValue: seed.canonicalValue })),
    ...unitAliasSeeds().map((seed) => ({ kind: "unit", alias: seed.alias, canonicalValue: seed.canonicalValue })),
  ];
  await db.insert(termAliases).values(rows.map((row) => ({
    id: newId(),
    organizationId: ctx.organizationId,
    projectId: null,
    kind: row.kind,
    alias: row.alias.toLowerCase(),
    canonicalValue: row.canonicalValue,
    source: "seed" as const,
  }))).onConflictDoNothing();
  const [{ count }] = (await db.execute(sql`
    select count(*)::int as count from "term_alias" where organization_id = ${ctx.organizationId}
  `) as unknown as { rows: { count: number }[] }).rows;
  return count;
}
