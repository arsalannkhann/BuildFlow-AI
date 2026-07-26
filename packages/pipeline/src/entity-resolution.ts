import { and, eq, isNull, or } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { newId } from "@buildflow/domain/ids";
import { reportEntityLinks, termAliases } from "@buildflow/db/schema";
import { listActivities, listLocations } from "@buildflow/db/queries/reference";
import { listMaterials } from "@buildflow/db/queries/materials";
import { listScheduleItems } from "@buildflow/db/queries/controls";
import type { DprStructuredData } from "@buildflow/domain/dpr/schema";
import {
  hasNegation, rankCandidates, readQuantity, resolveTerm,
  type AliasEntry, type Candidate, type Resolution,
} from "@buildflow/domain/resolve";
import type { AiRegistry } from "@buildflow/ai/registry";
import type { ResolutionQuestion } from "@buildflow/ai/resolve/schema";

/**
 * Turning what the engineer SAID into what the project HAS.
 *
 * A DPR is only operational if "chhe mistri the aur sariya khatam ho gaya" reaches the
 * database as six masons and a shortage against the project's own TMT steel row. Free text
 * cannot be billed, scheduled, or reconciled against a stock ledger; a linked record can.
 *
 * The cascade runs cheapest-and-most-auditable first, and every tier records HOW it decided
 * so a reviewer — and later an auditor — can see the reasoning rather than a bare answer:
 *
 *   1. `exact`      normalized equality with a project record        (deterministic, free)
 *   2. `alias`      seeded + LEARNED dictionary, en/hi/hinglish      (deterministic, free)
 *   3. `fuzzy`      trigram/token similarity with an ambiguity guard (deterministic, free)
 *   4. `semantic`   embedding nearest-neighbour with a margin guard  (this module)
 *   5. `llm`        model picks from a shortlist, or abstains        (this module)
 *   6. `unresolved` raw words kept, nothing invented, reviewer decides
 *
 * Tiers 1–3 live in `@buildflow/domain/resolve` and stay pure. Tiers 4–5 need I/O, so they
 * live here. Two invariants hold across all of them:
 *
 *   - resolution NEVER edits a claim. It attaches links and normalised readings beside the
 *     engineer's words; the words themselves are untouched (rules.md §11).
 *   - an unconfident mapping is stored as an open question for the reviewer, not applied.
 *     A wrong link that looks settled is worse than a visible gap, because nobody re-reads
 *     a mapping that already appears decided.
 */

export type EntityKind =
  | "location" | "activity" | "material" | "schedule_item" | "trade" | "unit" | "equipment";

export type FieldResolution = {
  fieldPath: string;
  entityKind: EntityKind;
  resolution: Resolution;
  /** Normalised quantity reading where the phrase carried one. */
  quantity?: { value: string | null; unitCode: string | null; unitUnknown: boolean };
  /** True when the phrase reads as an absence/shortage rather than a positive event. */
  negated?: boolean;
  /** The LLM tier's one-line justification, for display on the review screen only. */
  reason?: string;
};

export type ProjectVocabulary = {
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

export const recordsFor = (vocab: ProjectVocabulary, kind: EntityKind): Candidate[] => {
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
 * Runs the deterministic tiers over every referenceable phrase in an extracted DPR.
 * Pure with respect to the report: it returns findings and never mutates the structured data.
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
    // Equipment keeps its OWN kind even though no project table holds plant yet. Filing it
    // under `activity` would let the later tiers offer activity records as candidates, and
    // "JCB" would resolve to Excavation — a plausible-looking link between two different
    // things. Normalising the name via the dictionary is all that is honest here.
    out.push({ fieldPath: `equipment[${i}].name`, entityKind: "equipment", resolution });
  });

  return out;
}

/**
 * Cosine similarity floor for the semantic tier, and the margin the winner must hold over
 * the runner-up.
 *
 * Both numbers are conservative by design. Embedding neighbours are dense — every location
 * on a project is "similar" to every other location — so a bare top-1 would confidently link
 * "Block A basement" to "Block A". Requiring daylight between first and second place turns
 * that near-tie into a reviewer question, which is the outcome we want when the answer is
 * genuinely unclear.
 */
export const SEMANTIC_THRESHOLD = 0.78;
export const SEMANTIC_MARGIN = 0.04;
/** Shortlist size handed to the LLM tier. Long lists invite a plausible-looking wrong pick. */
export const LLM_SHORTLIST = 5;
/** Hard cap on LLM questions per report, so a pathological transcript cannot run up a bill. */
export const LLM_MAX_QUESTIONS = 12;

const dot = (a: number[], b: number[]): number => {
  let sum = 0;
  for (let i = 0; i < a.length && i < b.length; i += 1) sum += a[i] * b[i];
  return sum;
};

const magnitude = (v: number[]): number => Math.sqrt(dot(v, v)) || 1;

export const cosine = (a: number[], b: number[]): number =>
  dot(a, b) / (magnitude(a) * magnitude(b));

export type RefineOutcome = {
  findings: FieldResolution[];
  /** Counts only — safe for the audit trail, which must never carry transcript content. */
  stats: {
    open: number;
    semantic: number;
    llm: number;
    llmAsked: number;
    llmAbstained: number;
    llmSkipped: number;
    embeddingFailed: boolean;
  };
};

/**
 * Applies tiers 4 and 5 to the findings the deterministic tiers left open.
 *
 * Ordering matters: the semantic tier runs first because it is cheaper, reproducible, and
 * carries a numeric score a reviewer can weigh. The LLM is asked only about what survives —
 * and only ever to choose from a shortlist the server built.
 */
export async function refineResolutions(input: {
  ai: Pick<AiRegistry, "embeddings" | "resolution">;
  transcript: string;
  findings: FieldResolution[];
  vocab: ProjectVocabulary;
}): Promise<RefineOutcome> {
  const { ai, findings, vocab } = input;
  const findingsOut = findings.map((finding) => ({ ...finding }));
  const stats = {
    open: 0, semantic: 0, llm: 0, llmAsked: 0, llmAbstained: 0, llmSkipped: 0,
    embeddingFailed: false,
  };

  // Only phrases that are still open AND have records to point at are worth spending on.
  // A project with no locations recorded has nothing for "tower B" to resolve to, and no
  // amount of model reasoning changes that.
  const openIndexes = findingsOut
    .map((finding, index) => ({ finding, index }))
    .filter(({ finding }) =>
      !finding.resolution.confident
      && finding.resolution.method === "unresolved"
      && finding.resolution.rawText.trim().length > 0
      && recordsFor(vocab, finding.entityKind).length > 0);
  stats.open = openIndexes.length;
  if (openIndexes.length === 0) return { findings: findingsOut, stats };

  // ---- Tier 4: semantic ----------------------------------------------------------------
  // One embedding call for the whole report: every open phrase plus every record name it
  // could match, deduplicated. A per-phrase call would multiply latency for no extra signal.
  const phrases = [...new Set(openIndexes.map(({ finding }) => finding.resolution.rawText.trim()))];
  const recordNames = [...new Set(openIndexes.flatMap(({ finding }) =>
    recordsFor(vocab, finding.entityKind).map((record) => record.name)))];
  const vectors = new Map<string, number[]>();
  try {
    const texts = [...phrases, ...recordNames];
    const embedded = await ai.embeddings.embed({ texts });
    if (embedded.length === texts.length) {
      texts.forEach((text, i) => vectors.set(text, embedded[i]));
    }
  } catch {
    // A degraded search backend must not fail a report. The cascade simply drops to the
    // lexical shortlist, and the tier records that it could not run.
    stats.embeddingFailed = true;
  }

  const semanticRanking = (finding: FieldResolution): { candidate: Candidate; score: number }[] => {
    const phraseVector = vectors.get(finding.resolution.rawText.trim());
    if (!phraseVector) return [];
    return recordsFor(vocab, finding.entityKind)
      .flatMap((candidate) => {
        const candidateVector = vectors.get(candidate.name);
        return candidateVector ? [{ candidate, score: cosine(phraseVector, candidateVector) }] : [];
      })
      .sort((a, b) => b.score - a.score);
  };

  const stillOpen: { index: number; finding: FieldResolution; shortlist: Candidate[] }[] = [];

  for (const { index } of openIndexes) {
    const finding = findingsOut[index];
    const ranked = semanticRanking(finding);
    const best = ranked[0];
    const runnerUp = ranked[1];
    const decisive = best !== undefined
      && best.score >= SEMANTIC_THRESHOLD
      && (runnerUp === undefined || best.score - runnerUp.score >= SEMANTIC_MARGIN);

    if (decisive) {
      findingsOut[index] = {
        ...finding,
        resolution: {
          ...finding.resolution,
          method: "semantic",
          canonicalValue: best.candidate.name,
          entityId: best.candidate.id,
          score: best.score,
          candidates: [],
          confident: true,
        },
      };
      stats.semantic += 1;
      continue;
    }

    // Shortlist for the LLM: semantic order when we have it, lexical order otherwise. Either
    // way the model can only answer with an index into this list.
    const shortlist = (ranked.length > 0
      ? ranked.map((entry) => entry.candidate)
      : rankCandidates(finding.resolution.rawText, recordsFor(vocab, finding.entityKind))
        .map((entry) => entry.candidate)
    ).slice(0, LLM_SHORTLIST);
    // Record the shortlist even if the LLM tier never runs: the reviewer gets the same
    // ranked options on screen instead of an empty dropdown.
    findingsOut[index] = {
      ...finding,
      resolution: {
        ...finding.resolution,
        candidates: shortlist.map((candidate, rank) => ({
          id: candidate.id, name: candidate.name,
          score: ranked[rank]?.score ?? 0,
        })),
      },
    };
    if (shortlist.length > 0) stillOpen.push({ index, finding: findingsOut[index], shortlist });
  }

  // ---- Tier 5: LLM chooses from the shortlist, or abstains ------------------------------
  if (stillOpen.length === 0) return { findings: findingsOut, stats };
  const asking = stillOpen.slice(0, LLM_MAX_QUESTIONS);
  stats.llmSkipped = stillOpen.length - asking.length;
  stats.llmAsked = asking.length;

  const questions: ResolutionQuestion[] = asking.map(({ finding, shortlist }) => ({
    phrase: finding.resolution.rawText,
    kind: finding.entityKind.replaceAll("_", " "),
    candidates: shortlist.map((candidate) => candidate.name),
  }));

  let choices: Awaited<ReturnType<AiRegistry["resolution"]["choose"]>> = [];
  try {
    choices = await ai.resolution.choose({ transcript: input.transcript, questions });
  } catch {
    // Same rule as the embedding tier: an unavailable model leaves open questions for a
    // human, it does not fail the report or guess.
    return { findings: findingsOut, stats };
  }

  asking.forEach(({ index, shortlist }, questionIndex) => {
    const choice = choices[questionIndex];
    // `low` is re-checked here as well as inside each provider's clamp. The gate has to hold
    // at the point of USE, because a future provider implementation that forgets to clamp
    // must not be able to quietly widen what reaches a construction record.
    if (!choice || choice.choice_index === null || choice.confidence === "low") {
      stats.llmAbstained += 1;
      return;
    }
    const candidate = shortlist[choice.choice_index];
    if (!candidate) { stats.llmAbstained += 1; return; }
    findingsOut[index] = {
      ...findingsOut[index],
      resolution: {
        ...findingsOut[index].resolution,
        method: "llm",
        canonicalValue: candidate.name,
        entityId: candidate.id,
        // No numeric score exists for a model choice. Reporting one would invent precision;
        // the confidence band is what the reviewer actually needs to see.
        score: null,
        // Only "high" is applied without asking. Anything softer stays an open question,
        // with the shortlist preserved so the reviewer sees what the model was weighing.
        confident: choice.confidence === "high",
      },
      reason: choice.reason || undefined,
    };
    stats.llm += 1;
  });

  return { findings: findingsOut, stats };
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
    // Ranked alternatives are kept even when one of them was chosen: a reviewer overturning
    // a mapping needs to see the runners-up, not re-derive them.
    candidates: finding.resolution.candidates.length > 0 ? finding.resolution.candidates : null,
    reason: finding.reason ?? null,
  })));
}

/**
 * The whole cascade for one report revision, as used by the processing pipeline.
 * Returns the counts that go into the audit trail — never the phrases themselves.
 */
export async function resolveAndRecord(
  db: AppDb, ctx: TenantContext,
  input: {
    ai: Pick<AiRegistry, "embeddings" | "resolution">;
    reportId: string;
    projectId: string;
    revisionId: string;
    data: DprStructuredData;
    transcript: string;
  },
): Promise<RefineOutcome["stats"] & { total: number; linked: number }> {
  const vocab = await loadProjectVocabulary(db, ctx, input.projectId);
  const deterministic = resolveReportEntities(input.data, vocab);
  const refined = await refineResolutions({
    ai: input.ai, transcript: input.transcript, findings: deterministic, vocab,
  });
  await recordResolutions(db, ctx, {
    reportId: input.reportId, projectId: input.projectId, revisionId: input.revisionId,
    findings: refined.findings,
  });
  return {
    ...refined.stats,
    total: refined.findings.length,
    linked: refined.findings.filter((finding) => finding.resolution.entityId !== null).length,
  };
}
