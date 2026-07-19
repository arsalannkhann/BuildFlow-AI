import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { cmpDecimal, normalizeDecimal } from "@buildflow/domain/decimal";
import { formatINR } from "@buildflow/domain/money";
import { listProjects, type ProjectRow } from "@buildflow/db/queries/projects";
import { listReports } from "@buildflow/db/queries/reports";
import {
  listBlockers, listDocumentRevisions, listDocuments, listProgressUpdates, listScheduleItems,
} from "@buildflow/db/queries/controls";
import { listMaterials, stockLevels } from "@buildflow/db/queries/materials";
import { listInvoices } from "@buildflow/db/queries/invoices";
import {
  getSearchDocuments, searchProjectedDocuments, userProjectScope,
} from "@buildflow/db/queries/search";
import { getAiRegistry } from "@buildflow/ai/registry";
import type { GroundedPassage } from "@buildflow/ai/ports";

// READ-ONLY assistant core (Phase E4). This module must never mutate records: it imports
// exclusively from the query layer (@buildflow/db/queries/*), pure domain helpers, and
// the AI ports — NO action modules, NO service cores with mutations. Deterministic
// intents are answered purely by SQL-backed reads WITH citations; only the free-text
// fallback consults an AI provider, and then only over permission-filtered passages.

export type AssistantCitation = {
  ref: string;
  kind: string;
  title: string;
  href: string;
  status: string;
  approved: boolean;
};

export type AssistantAnswer = {
  mode: "deterministic" | "grounded";
  intent: string;
  answer: string;
  citations: AssistantCitation[];
  insufficientEvidence: boolean;
};

const APPROVED = new Set(["APPROVED", "ISSUED", "SUPERSEDED", "approved", "posted", "certified", "exported"]);
const approved = (status: string) => APPROVED.has(status);

const hrefFor = (kind: string, projectId: string, refId: string): string => {
  switch (kind) {
    case "report": return `/reports/${refId}`;
    case "invoice": return `/projects/${projectId}/budget/invoices/${refId}`;
    case "receipt": return `/projects/${projectId}/materials/receipts/${refId}`;
    case "rfi": return `/projects/${projectId}/rfis/${refId}`;
    case "blocker": return `/projects/${projectId}/blockers`;
    case "mb_entry": return `/projects/${projectId}/mb/${refId}`;
    case "document": return `/projects/${projectId}/documents/${refId}`;
    case "schedule_item": return `/projects/${projectId}/schedule`;
    case "material": return `/projects/${projectId}/materials/${refId}`;
    case "project": return `/projects/${projectId}`;
    default: return `/projects/${projectId}`;
  }
};

const insufficient = (intent: string, answer: string): AssistantAnswer => ({
  mode: "deterministic", intent, answer, citations: [], insufficientEvidence: true,
});

const dayDiff = (fromIso: string, toIso: string): number =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);

const addDays = (iso: string, days: number): string =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

// --- shared read-only lookups ---

async function scopedProjects(db: AppDb, ctx: TenantContext): Promise<ProjectRow[]> {
  const scope = await userProjectScope(db, ctx);
  const all = await listProjects(db, ctx);
  return scope.orgWide ? all : all.filter((p) => scope.projectIds.includes(p.id));
}

type DelayedItem = {
  project: ProjectRow;
  scheduleItemId: string;
  name: string;
  daysLate: number;
  baselineSlipDays: number | null;
  openBlockers: { id: string; title: string; severity: string }[];
  lastEvidence: { reportId: string; date: string } | null;
  explanation: string;
};

/** Same record-backed delay rule as the project overview, recomputed read-only here. */
async function delayedItemsFor(
  db: AppDb, ctx: TenantContext, project: ProjectRow, today: string,
): Promise<DelayedItem[]> {
  const [items, blockers, reports] = await Promise.all([
    listScheduleItems(db, ctx, project.id),
    listBlockers(db, ctx, project.id),
    listReports(db, ctx),
  ]);
  const projectReports = reports.filter((r) => r.projectId === project.id);
  const openBlockers = blockers.filter((b) => b.status !== "resolved");
  const out: DelayedItem[] = [];
  for (const item of items) {
    if (item.status === "complete" || !item.currentEnd || item.currentEnd >= today) continue;
    const daysLate = dayDiff(item.currentEnd, today);
    const baselineSlipDays = item.baselineEnd ? dayDiff(item.baselineEnd, item.currentEnd) : null;
    const itemBlockers = openBlockers
      .filter((b) => b.scheduleItemId === item.id)
      .map((b) => ({ id: b.id, title: b.title, severity: b.severity }));
    const updates = await listProgressUpdates(db, ctx, item.id);
    const withReport = updates.find((u) => u.reportId);
    let lastEvidence: DelayedItem["lastEvidence"] = null;
    if (withReport?.reportId) {
      const report = projectReports.find((r) => r.id === withReport.reportId);
      if (report) lastEvidence = { reportId: report.id, date: report.reportDate };
    }
    const reasons = [
      `${item.progressPercent}% complete, current end ${item.currentEnd} is ${daysLate} day(s) past`,
    ];
    if (baselineSlipDays && baselineSlipDays > 0) reasons.push(`${baselineSlipDays} day(s) behind baseline ${item.baselineEnd}`);
    if (itemBlockers.length) reasons.push(`${itemBlockers.length} open blocker(s): ${itemBlockers.map((b) => b.title).join("; ")}`);
    reasons.push(lastEvidence ? `last approved evidence ${lastEvidence.date}` : "no approved report evidence recorded");
    out.push({
      project, scheduleItemId: item.id, name: item.name, daysLate, baselineSlipDays,
      openBlockers: itemBlockers, lastEvidence, explanation: reasons.join(". "),
    });
  }
  return out.sort((a, b) => b.daysLate - a.daysLate);
}

// --- deterministic intents (SQL only, always cited, no AI involved) ---

async function delayedProjectsIntent(
  db: AppDb, ctx: TenantContext, today: string,
): Promise<AssistantAnswer> {
  const projects = await scopedProjects(db, ctx);
  const citations: AssistantCitation[] = [];
  const lines: string[] = [];
  for (const project of projects) {
    const delayed = await delayedItemsFor(db, ctx, project, today);
    if (delayed.length === 0) continue;
    lines.push(`${project.name}: ${delayed.length} late schedule item(s), worst ${delayed[0].daysLate} day(s) — ${delayed[0].name}`);
    citations.push({
      ref: project.id, kind: "project", title: project.name,
      href: hrefFor("project", project.id, project.id), status: "overview", approved: false,
    });
    for (const d of delayed.slice(0, 3)) {
      citations.push({
        ref: d.scheduleItemId, kind: "schedule_item", title: `${d.name} (${d.daysLate} day(s) late)`,
        href: hrefFor("schedule_item", project.id, d.scheduleItemId), status: "delayed", approved: false,
      });
    }
  }
  return {
    mode: "deterministic", intent: "delayed_projects",
    answer: lines.length === 0
      ? "No projects currently show delay indicators (no schedule item has a current end date in the past)."
      : `Projects with delay indicators:\n${lines.join("\n")}`,
    citations, insufficientEvidence: false,
  };
}

async function whyDelayedIntent(
  db: AppDb, ctx: TenantContext, nameQuery: string, today: string,
): Promise<AssistantAnswer> {
  const projects = await scopedProjects(db, ctx);
  const needle = nameQuery.trim().toLowerCase();
  const project = projects.find((p) => p.name.toLowerCase() === needle)
    ?? projects.find((p) => p.name.toLowerCase().includes(needle));
  if (!project) {
    return insufficient("why_delayed", `No project named "${nameQuery.trim()}" is visible to you — not enough evidence to answer.`);
  }
  const delayed = await delayedItemsFor(db, ctx, project, today);
  if (delayed.length === 0) {
    return {
      mode: "deterministic", intent: "why_delayed",
      answer: `${project.name} shows no delay indicators today: no schedule item has a current end date in the past.`,
      citations: [{
        ref: project.id, kind: "project", title: project.name,
        href: hrefFor("project", project.id, project.id), status: "overview", approved: false,
      }],
      insufficientEvidence: false,
    };
  }
  const citations: AssistantCitation[] = delayed.flatMap((d) => [
    {
      ref: d.scheduleItemId, kind: "schedule_item", title: d.name,
      href: hrefFor("schedule_item", project.id, d.scheduleItemId), status: "delayed", approved: false,
    },
    ...d.openBlockers.map((b) => ({
      ref: b.id, kind: "blocker", title: `Blocker: ${b.title} (${b.severity})`,
      href: hrefFor("blocker", project.id, b.id), status: "open", approved: false,
    })),
    ...(d.lastEvidence ? [{
      ref: d.lastEvidence.reportId, kind: "report", title: `Approved DPR ${d.lastEvidence.date}`,
      href: hrefFor("report", project.id, d.lastEvidence.reportId), status: "APPROVED", approved: true,
    }] : []),
  ]);
  return {
    mode: "deterministic", intent: "why_delayed",
    answer: `${project.name} delay indicators (each built only from stored records):\n` +
      delayed.map((d) => `- ${d.name}: ${d.explanation}`).join("\n"),
    citations, insufficientEvidence: false,
  };
}

async function overdueBlockersIntent(
  db: AppDb, ctx: TenantContext, today: string,
): Promise<AssistantAnswer> {
  const projects = await scopedProjects(db, ctx);
  const citations: AssistantCitation[] = [];
  const lines: string[] = [];
  for (const project of projects) {
    const blockers = (await listBlockers(db, ctx, project.id))
      .filter((b) => b.status !== "resolved" && b.dueDate && b.dueDate < today);
    for (const b of blockers) {
      lines.push(`${project.name}: "${b.title}" (${b.severity}) was due ${b.dueDate}${b.ownerName ? `, owner ${b.ownerName}` : ""}`);
      citations.push({
        ref: b.id, kind: "blocker", title: b.title,
        href: hrefFor("blocker", project.id, b.id), status: b.status, approved: false,
      });
    }
  }
  return {
    mode: "deterministic", intent: "overdue_blockers",
    answer: lines.length === 0 ? "No open blockers are past their due date." : `Overdue blockers:\n${lines.join("\n")}`,
    citations, insufficientEvidence: false,
  };
}

async function materialStockIntent(
  db: AppDb, ctx: TenantContext, nameQuery: string,
): Promise<AssistantAnswer> {
  const materials = await listMaterials(db, ctx);
  const needle = nameQuery.trim().toLowerCase();
  const material = materials.find((m) => m.name.toLowerCase() === needle)
    ?? materials.find((m) => m.name.toLowerCase().includes(needle) || needle.includes(m.name.toLowerCase()));
  if (!material) {
    return insufficient("material_stock", `No material named "${nameQuery.trim()}" exists in the catalogue — not enough evidence to answer.`);
  }
  const projects = await scopedProjects(db, ctx);
  const citations: AssistantCitation[] = [];
  const lines: string[] = [];
  for (const project of projects) {
    const level = (await stockLevels(db, ctx, project.id))
      .find((l) => l.materialId === material.id)?.currentStock;
    if (level === undefined) continue;
    const current = normalizeDecimal(level);
    const short = material.reorderThreshold != null && cmpDecimal(current, material.reorderThreshold) < 0;
    lines.push(`${project.name}: ${current} ${material.unit} (ledger sum)${short ? ` — BELOW reorder threshold ${material.reorderThreshold}` : ""}`);
    citations.push({
      ref: material.id, kind: "material", title: `${material.name} stock ledger — ${project.name}`,
      href: hrefFor("material", project.id, material.id), status: short ? "shortage" : "in_stock", approved: false,
    });
  }
  if (lines.length === 0) {
    return insufficient("material_stock", `${material.name} has no stock ledger entries in your projects yet — not enough evidence to answer.`);
  }
  return {
    mode: "deterministic", intent: "material_stock",
    answer: `${material.name} on hand (append-only ledger sums, no prediction):\n${lines.join("\n")}`,
    citations, insufficientEvidence: false,
  };
}

async function invoicesOverIntent(
  db: AppDb, ctx: TenantContext, amountRupees: number,
): Promise<AssistantAnswer> {
  const thresholdPaise = Math.round(amountRupees * 100);
  const projects = await scopedProjects(db, ctx);
  const citations: AssistantCitation[] = [];
  const lines: string[] = [];
  for (const project of projects) {
    for (const inv of await listInvoices(db, ctx, project.id)) {
      if (inv.totalPaise == null || inv.totalPaise <= thresholdPaise) continue;
      lines.push(`${project.name}: Invoice ${inv.invoiceNumber ?? "(no number)"} — ${formatINR(inv.totalPaise)} (${inv.status})`);
      citations.push({
        ref: inv.id, kind: "invoice", title: `Invoice ${inv.invoiceNumber ?? "(no number)"} — ${formatINR(inv.totalPaise)}`,
        href: hrefFor("invoice", project.id, inv.id), status: inv.status, approved: approved(inv.status),
      });
    }
  }
  return {
    mode: "deterministic", intent: "invoices_over",
    answer: lines.length === 0
      ? `No invoices above ${formatINR(thresholdPaise)} in your projects (compared in paise).`
      : `Invoices above ${formatINR(thresholdPaise)} (approved and draft records are labeled):\n${lines.join("\n")}`,
    citations, insufficientEvidence: false,
  };
}

async function missingReportsIntent(
  db: AppDb, ctx: TenantContext, today: string,
): Promise<AssistantAnswer> {
  const projects = await scopedProjects(db, ctx);
  const reports = await listReports(db, ctx);
  const citations: AssistantCitation[] = [];
  const lines: string[] = [];
  for (const project of projects) {
    const dates = new Set(reports.filter((r) => r.projectId === project.id).map((r) => r.reportDate));
    const missing = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).filter((d) => !dates.has(d));
    if (missing.length === 0) continue;
    lines.push(`${project.name}: no report for ${missing.join(", ")}`);
    citations.push({
      ref: project.id, kind: "project", title: `${project.name} — reporting completeness`,
      href: hrefFor("project", project.id, project.id), status: `${7 - missing.length}/7 days`, approved: false,
    });
  }
  return {
    mode: "deterministic", intent: "missing_reports",
    answer: lines.length === 0
      ? "Every visible project has a report for each of the last 7 days."
      : `Report gaps over the last 7 days:\n${lines.join("\n")}`,
    citations, insufficientEvidence: false,
  };
}

async function drawingRevisionsIntent(db: AppDb, ctx: TenantContext): Promise<AssistantAnswer> {
  const projects = await scopedProjects(db, ctx);
  const entries: { projectId: string; docId: string; title: string; label: string; notes: string | null; at: Date }[] = [];
  for (const project of projects) {
    for (const doc of await listDocuments(db, ctx, project.id)) {
      for (const rev of await listDocumentRevisions(db, ctx, doc.id)) {
        entries.push({
          projectId: project.id, docId: doc.id, title: doc.title,
          label: rev.revisionLabel, notes: rev.notes, at: rev.createdAt,
        });
      }
    }
  }
  entries.sort((a, b) => b.at.getTime() - a.at.getTime());
  const latest = entries.slice(0, 5);
  if (latest.length === 0) {
    return insufficient("drawing_revisions", "No drawing revisions are registered in your projects — not enough evidence to answer.");
  }
  return {
    mode: "deterministic", intent: "drawing_revisions",
    answer: "Latest drawing revision changes (register notes verbatim):\n" + latest.map((e) =>
      `- ${e.title} Rev ${e.label}${e.notes ? `: ${e.notes}` : " (no notes recorded)"}`).join("\n"),
    citations: latest.map((e) => ({
      ref: e.docId, kind: "document", title: `${e.title} Rev ${e.label}`,
      href: hrefFor("document", e.projectId, e.docId), status: "issued", approved: true,
    })),
    insufficientEvidence: false,
  };
}

// --- free-text fallback: retrieval + GroundedAnswerPort ---

const RETRIEVAL_STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "did", "do", "does", "for", "from", "happened",
  "has", "have", "how", "i", "in", "is", "it", "me", "of", "on", "please", "show",
  "status", "tell", "the", "to", "was", "were", "what", "when", "where", "which", "why",
  "with",
]);

/** Remove conversational filler before PostgreSQL's AND-style plain-text query. */
function retrievalQuery(question: string): string {
  const terms = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const meaningful = terms.filter((term) => term.length > 1 && !RETRIEVAL_STOP_WORDS.has(term));
  return meaningful.join(" ") || question;
}

async function groundedFallback(db: AppDb, ctx: TenantContext, question: string): Promise<AssistantAnswer> {
  const scope = await userProjectScope(db, ctx);
  const hits = await searchProjectedDocuments(db, ctx, retrievalQuery(question), {
    projectIds: scope.orgWide ? "all" : scope.projectIds, limit: 8,
  });
  const passages: GroundedPassage[] = hits.map((h) => ({
    ref: h.id, kind: h.kind, title: h.title, snippet: h.body.slice(0, 500), status: h.recordStatus,
  }));
  const raw = await getAiRegistry().grounded.answer({ question, passages });

  // Server-side scope enforcement: a citation must reference one of the passages WE
  // retrieved for THIS user; anything else is dropped. If none survive (or the provider
  // flags it), the honest state is "not enough evidence" — never an uncited answer.
  const retrieved = new Map(hits.map((h) => [h.id, h]));
  const validRefs = raw.citations.filter((ref) => retrieved.has(ref));
  const inScope = await getSearchDocuments(db, ctx, validRefs); // re-checked org-scoped
  if (raw.insufficient_evidence || inScope.length === 0) {
    return {
      mode: "grounded", intent: "free_text", answer: "",
      citations: [], insufficientEvidence: true,
    };
  }
  return {
    mode: "grounded", intent: "free_text", answer: raw.answer,
    citations: inScope.map((d) => ({
      ref: d.id, kind: d.kind, title: d.title,
      href: hrefFor(d.kind, d.projectId, d.refId), status: d.recordStatus,
      approved: approved(d.recordStatus),
    })),
    insufficientEvidence: false,
  };
}

// --- entry point ---

const AMOUNT_RE = /invoices?\s+(?:over|above|more than|greater than|>)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(lakh|lac|crore)?/i;

export async function askAssistant(
  db: AppDb, ctx: TenantContext, question: string,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<AssistantAnswer> {
  assertCan(ctx, "project.read");
  const q = question.trim();
  if (!q) return insufficient("empty", "Ask a question about your projects.");

  const why = q.match(/why\s+is\s+(?:project\s+)?(.+?)\s+(?:delayed|late|behind)/i);
  if (why) return whyDelayedIntent(db, ctx, why[1], today);

  if (/(?:which|what)\s+projects?\s+(?:are|is)\s+(?:delayed|late|behind)|delayed\s+projects?|projects?\s+(?:running\s+)?(?:delayed|late|behind)/i.test(q)) {
    return delayedProjectsIntent(db, ctx, today);
  }

  if (/overdue\s+blockers?|blockers?\s+(?:past|over)\s*due/i.test(q)) {
    return overdueBlockersIntent(db, ctx, today);
  }

  const stock = q.match(/how\s+much\s+(?:of\s+)?(.+?)\s+(?:remains|is\s+left|left|is\s+in\s+stock|in\s+stock|do\s+we\s+have)/i)
    ?? q.match(/stock\s+of\s+(.+?)\s*\??$/i);
  if (stock) return materialStockIntent(db, ctx, stock[1]);

  const amount = q.match(AMOUNT_RE);
  if (amount) {
    const base = Number(amount[1].replaceAll(",", ""));
    const multiplier = amount[2] ? (/crore/i.test(amount[2]) ? 1e7 : 1e5) : 1;
    if (Number.isFinite(base)) return invoicesOverIntent(db, ctx, base * multiplier);
  }

  if (/(?:which|what)\s+reports?\s+(?:are|is)\s+missing|missing\s+reports?|reports?\s+missing/i.test(q)) {
    return missingReportsIntent(db, ctx, today);
  }

  if (/latest\s+drawing|drawing\s+revisions?|revision\s+changes?/i.test(q)) {
    return drawingRevisionsIntent(db, ctx);
  }

  return groundedFallback(db, ctx, q);
}

export const ASSISTANT_SAMPLE_QUESTIONS = [
  "Which projects are delayed?",
  "Overdue blockers",
  "How much cement remains?",
  "Invoices over ₹50,000",
  "Which reports are missing?",
  "Latest drawing revision changes",
] as const;
