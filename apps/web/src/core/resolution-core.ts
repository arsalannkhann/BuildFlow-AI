import { and, eq, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { newId } from "@buildflow/domain/ids";
import { reportEntityLinks, termAliases } from "@buildflow/db/schema";
import { audit } from "@buildflow/db/queries/audit";

/**
 * Review-side of entity resolution: reading the trail the pipeline produced, and correcting it.
 *
 * Producing the mapping lives in `@buildflow/pipeline/entity-resolution` because it runs in
 * the worker, where the report is processed. It is re-exported here so a request path can
 * recompute on demand (a reviewer who has just added the missing location wants the mapping
 * re-run without re-recording the site update) without a second implementation of the
 * cascade drifting away from the one that actually writes reports.
 */
export {
  loadProjectVocabulary, recordResolutions, refineResolutions, resolveAndRecord,
  resolveReportEntities,
} from "@buildflow/pipeline/entity-resolution";
export type { EntityKind, FieldResolution, ProjectVocabulary } from "@buildflow/pipeline/entity-resolution";

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
    const kind = link.entityKind === "schedule_item" ? "activity" : link.entityKind;
    // A re-correction MUST overwrite the learned alias, not be dropped. If a reviewer first
    // taught "mistri" -> Mason and later corrects it to Carpenter, a plain insert-or-ignore
    // would fix this one report but leave the stale alias in place, and every future report
    // would keep resolving "mistri" -> Mason confidently with no prompt — a silent, permanent
    // corruption of the learning loop.
    //
    // A learned alias is always project-scoped (report_entity_link.project_id is NOT NULL), so
    // the existing row is matched directly on its concrete project id — no need to reproduce
    // the `coalesce(project_id,'')` expression from the unique index, which never collides a
    // project-scoped learned alias with an org-scoped seed anyway.
    const learned = {
      canonicalValue: input.canonicalValue ?? alias,
      canonicalId: input.entityId,
      source: "learned" as const,
      confirmedBy: ctx.userId,
    };
    const [existing] = await db.select({ id: termAliases.id }).from(termAliases).where(and(
      eq(termAliases.organizationId, ctx.organizationId),
      eq(termAliases.projectId, link.projectId),
      eq(termAliases.kind, kind),
      eq(termAliases.alias, alias),
    ));
    if (existing) {
      await db.update(termAliases).set(learned).where(eq(termAliases.id, existing.id));
    } else {
      await db.insert(termAliases).values({
        id: newId(),
        organizationId: ctx.organizationId,
        projectId: link.projectId,
        kind,
        alias,
        ...learned,
      }).onConflictDoNothing(); // backstop against a concurrent confirm of the same phrase
    }
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
