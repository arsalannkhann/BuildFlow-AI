import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { DPR_SCHEMA_VERSION, dprSchema } from "@buildflow/domain/dpr/schema";
import { runDeterministicValidations } from "@buildflow/domain/dpr/validate";
import { getAiRegistry } from "@buildflow/ai/registry";
import { listAttachments } from "@buildflow/db/queries/attachments";
import { addRevision } from "@buildflow/db/queries/revisions";
import { getReport, setReportStatus, setCurrentRevision } from "@buildflow/db/queries/reports";
import { startRun, finishRun, recordStage } from "@buildflow/db/queries/processing";
import { audit } from "@buildflow/db/queries/audit";
import { notifyEvent } from "@buildflow/notify/emit";
import { getStorage } from "@buildflow/storage/factory";

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

    // Stage: transcribe
    failedStage = "transcribe";
    const audioBytes = await storage.get(audio.objectKey);
    const transcript = await ai.transcription.transcribe({ audioBytes });
    await recordStage(db, runId, "transcribe", "succeeded", 0);

    // Stage: extract. Central never-invent gate: validate the model output against the
    // schema regardless of provider, so the invariant does not depend on each port impl
    // remembering to parse. Malformed output throws -> visible PROCESSING_FAILED.
    failedStage = "extract";
    const extracted = dprSchema.parse(await ai.extraction.extract({ transcript }));
    await recordStage(db, runId, "extract", "succeeded", 0);

    // Stage: deterministic validation
    failedStage = "validate";
    const { data } = runDeterministicValidations(extracted);
    await recordStage(db, runId, "validate", "succeeded", 0);

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
    await setCurrentRevision(db, ctx, reportId, rev.id);
    await setReportStatus(db, ctx, reportId, "AWAITING_REVIEW");
    await recordStage(db, runId, "createRevision", "succeeded", 0);

    await finishRun(db, ctx, runId, "succeeded");
    await audit(db, ctx, { action: "report.processed", subjectRef: reportId, metadata: { runId } });
    // Phase E1 hook: reviewers learn a draft is ready. Title carries a record reference
    // only — never extracted content (rules.md §14). Deliver jobs land on this same
    // queue, so the running drain loop / worker picks them up next.
    const done = await getReport(db, ctx, reportId);
    await notifyEvent(db, ctx, {
      eventKind: "report.awaiting_review", subjectRef: reportId, projectId: done.projectId,
      title: `DPR ${done.reportDate} is ready for review`,
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
