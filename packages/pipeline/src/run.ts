import { and, eq } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { DPR_SCHEMA_VERSION, dprSchema } from "@buildflow/domain/dpr/schema";
import { runDeterministicValidations } from "@buildflow/domain/dpr/validate";
import { getAiRegistry } from "@buildflow/ai/registry";
import { listAttachments } from "@buildflow/db/queries/attachments";
import { addRevision } from "@buildflow/db/queries/revisions";
import { getReport, previousReportData, setReportStatus, setCurrentRevision } from "@buildflow/db/queries/reports";
import { checkConsistency } from "@buildflow/domain/dpr/consistency";
import { startRun, finishRun, recordStage } from "@buildflow/db/queries/processing";
import { audit } from "@buildflow/db/queries/audit";
import { attachments as attachmentTable } from "@buildflow/db/schema";
import { notifyEvent } from "@buildflow/notify/emit";
import { getStorage } from "@buildflow/storage/factory";
import { probeAudioDuration } from "./audio-duration";
import { attachPhotoEvidence } from "./photo-evidence";
import { buildNormalizedTranscript, storeNormalizedTranscript } from "./transcript-normalization";
import { resolveAndRecord } from "./entity-resolution";

export async function runProcessing(db: AppDb, ctx: TenantContext, reportId: string): Promise<void> {
  const ai = getAiRegistry();
  const storage = getStorage();
  const runId = await startRun(db, ctx, {
    reportId, provider: ai.extraction.meta.provider, model: ai.extraction.meta.model,
    promptVersion: ai.extraction.meta.promptVersion, schemaVersion: DPR_SCHEMA_VERSION,
  });

  let failedStage = "validateManifest";
  try {
    // Stage: validate media manifest (audio present)
    failedStage = "validateManifest";
    const atts = await listAttachments(db, ctx, reportId);
    const audio = atts.find((a) => a.kind === "audio");
    if (!audio) throw Object.assign(new Error("No audio attachment"), { category: "invalid_input" });
    await recordStage(db, runId, "validateManifest", "succeeded", 0);

    // Stage: probe media. Reads the recording length out of the container so the reviewer
    // can be warned about a six-second "daily update". Null when the container does not say
    // — an unknown duration produces no signal rather than a fabricated one.
    failedStage = "probeMedia";
    const audioBytes = await storage.get(audio.objectKey);
    const probe = probeAudioDuration(audioBytes);
    if (probe && audio.durationMs !== probe.durationMs) {
      await db.update(attachmentTable)
        .set({ durationMs: probe.durationMs })
        .where(and(
          eq(attachmentTable.id, audio.id),
          eq(attachmentTable.organizationId, ctx.organizationId),
        ));
    }
    await recordStage(db, runId, "probeMedia", "succeeded", 0);

    // Stage: transcribe
    failedStage = "transcribe";
    const transcript = await ai.transcription.transcribe({ audioBytes });
    await recordStage(db, runId, "transcribe", "succeeded", 0);

    // Stage: extract. Central never-invent gate: validate the model output against the
    // schema regardless of provider, so the invariant does not depend on each port impl
    // remembering to parse. Malformed output throws -> visible PROCESSING_FAILED.
    failedStage = "extract";
    const extracted = dprSchema.parse(await ai.extraction.extract({ transcript }));
    await recordStage(db, runId, "extract", "succeeded", 0);

    // Stage: deterministic validation, now including the recording-quality signals. A short
    // or near-silent recording downgrades every Supported item to Check and raises an issue;
    // it NEVER rejects the report — the engineer's work is preserved either way.
    failedStage = "validate";
    const validated = runDeterministicValidations(extracted, transcript.text, {
      durationMs: probe?.durationMs ?? audio.durationMs ?? null,
      transcriptText: transcript.text,
    });
    const qualityIssues = validated.issues.filter(
      (issue) => issue.code === "audio_too_short" || issue.code === "transcript_sparse_for_duration",
    );
    await recordStage(db, runId, "validate", "succeeded", 0);

    // Stage: photo evidence. Links photos to the work items they show so `attachment_id`
    // citations are real. Evidence only — it can add source refs and nothing else.
    failedStage = "tagPhotos";
    const photos = atts
      .filter((a) => a.kind === "photo" && a.uploadedAt !== null)
      .map((a) => ({ id: a.id, objectKey: a.objectKey, contentType: a.contentType }));
    const tagging = await attachPhotoEvidence({
      ai, storage, data: validated.data, photos,
    });
    const data = tagging.data;
    await recordStage(db, runId, "tagPhotos", "succeeded", 0);

    // Stage: normalized transcript. Hindi/Hinglish updates get an English rendering stored
    // beside the original; English updates produce nothing at all.
    failedStage = "normalizeTranscript";
    const normalized = await buildNormalizedTranscript({ ai, transcript });
    await recordStage(db, runId, "normalizeTranscript", "succeeded", 0);

    // Stage: summaries
    failedStage = "summarize";
    const summaries = await ai.summary.summarize({ data });
    await recordStage(db, runId, "summarize", "succeeded", 0);

    // Stage: create revision + advance state
    failedStage = "createRevision";
    const rev = await addRevision(db, ctx, {
      reportId, structuredData: data, isAiGenerated: true,
      summaryInternal: summaries.internal, summaryClientSafe: summaries.clientSafe, transcript,
    });
    // Additive: the original transcript above is already stored and is never rewritten.
    if (normalized) await storeNormalizedTranscript(db, ctx, rev.id, normalized);
    await setCurrentRevision(db, ctx, reportId, rev.id);
    await setReportStatus(db, ctx, reportId, "AWAITING_REVIEW");
    await recordStage(db, runId, "createRevision", "succeeded", 0);

    // Stage: entity resolution. Maps the engineer's own words onto this project's locations,
    // activities, materials and units so the report can be reconciled against the schedule
    // and the stock ledger instead of being read by eye. It only ever ATTACHES links beside
    // the claim — the revision written above is never rewritten — so a failure here costs
    // reviewer convenience, not the record. That is why it runs after the revision exists
    // and cannot fail the run.
    failedStage = "resolveEntities";
    const saved = await getReport(db, ctx, reportId);
    const resolution = await resolveAndRecord(db, ctx, {
      ai, reportId, projectId: saved.projectId, revisionId: rev.id,
      data, transcript: transcript.text,
    }).catch(() => null);
    await recordStage(db, runId, "resolveEntities", resolution ? "succeeded" : "failed", 0);

    // Stage: contractual consistency (blueprint §8.2). Cross-field and cross-day checks that
    // ask whether the report contradicts itself or omits the evidence a claim needs. Advisory
    // only — like the resolution stage it runs after the revision exists, never edits it, and
    // cannot fail the run. Findings ride the review notification so a reviewer sees them first.
    failedStage = "checkConsistency";
    const previous = await previousReportData(db, ctx, saved.projectId, saved.reportDate)
      .catch(() => null);
    const consistency = (() => {
      try { return checkConsistency(data, { previous }); } catch { return []; }
    })();
    await recordStage(db, runId, "checkConsistency", "succeeded", 0);

    await finishRun(db, ctx, runId, "succeeded");
    await audit(db, ctx, {
      action: "report.processed", subjectRef: reportId,
      // Counts and codes only — never a caption, quote or transcript line (rules.md §14).
      metadata: {
        runId,
        audioDurationMs: probe?.durationMs ?? null,
        audioDurationSource: probe?.source ?? null,
        photosConsidered: tagging.considered,
        photosLinked: tagging.linked,
        photosFailed: tagging.failed,
        transcriptNormalized: normalized !== null,
        // Counts only: how many spoken phrases were mapped, and by which tier (rules.md §14).
        entityPhrases: resolution?.total ?? null,
        entityLinked: resolution?.linked ?? null,
        entityOpen: resolution?.open ?? null,
        entityBySemantic: resolution?.semantic ?? null,
        entityByLlm: resolution?.llm ?? null,
        entityLlmAbstained: resolution?.llmAbstained ?? null,
        qualityIssues: qualityIssues.map((issue) => issue.code),
        // Codes only — a consistency finding names a field and a rule, never report content.
        consistencyFindings: consistency.map((finding) => finding.code),
      },
    });
    // Phase E1 hook: reviewers learn a draft is ready. Title carries a record reference
    // only — never extracted content (rules.md §14). Deliver jobs land on this same
    // queue, so the running drain loop / worker picks them up next.
    await notifyEvent(db, ctx, {
      eventKind: "report.awaiting_review", subjectRef: reportId, projectId: saved.projectId,
      title: `DPR ${saved.reportDate} is ready for review`,
      // The recording-quality warning and any consistency questions travel with the
      // notification so a reviewer sees them before opening the draft. Both describe the
      // record and the recording — never quote its content (rules.md §14).
      body: [...qualityIssues, ...consistency].length > 0
        ? [...qualityIssues.map((i) => i.message), ...consistency.map((f) => f.message)].join(" ")
        : undefined,
    });
  } catch (err) {
    const category = (err as { category?: string })?.category ?? "processing_error";
    // Move to a terminal state only if still mid-processing, so the report can never be
    // stuck in PROCESSING. A failure in post-success bookkeeping (after the report already
    // reached AWAITING_REVIEW) must not attempt an illegal AWAITING_REVIEW->PROCESSING_FAILED
    // transition and surface a spurious error.
    const current = await getReport(db, ctx, reportId).catch(() => null);
    if (current?.status === "PROCESSING") {
      await setReportStatus(db, ctx, reportId, "PROCESSING_FAILED"); // inputs preserved
    }
    // Best-effort bookkeeping — must not block the terminal transition above.
    try {
      await recordStage(db, runId, failedStage, "failed", 0, category);
      await finishRun(db, ctx, runId, "failed", category);
      await audit(db, ctx, { action: "report.processing_failed", subjectRef: reportId, metadata: { category, stage: failedStage } });
      // Phase E1 hook: reviewers own the retry / manual-draft recovery path.
      await notifyEvent(db, ctx, {
        eventKind: "report.processing_failed", subjectRef: reportId, projectId: ctx.projectId,
        title: "Report processing failed", body: `Failure category: ${category} (stage ${failedStage})`,
      });
    } catch {
      // status is already PROCESSING_FAILED; swallow bookkeeping errors
    }
  }
}
