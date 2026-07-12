import type { AppDb } from "@/db/client";
import type { TenantContext } from "@/domain/tenancy";
import { DPR_SCHEMA_VERSION } from "@/domain/dpr/schema";
import { runDeterministicValidations } from "@/domain/dpr/validate";
import { getAiRegistry } from "@/ai/registry";
import { listAttachments } from "@/db/queries/attachments";
import { addRevision } from "@/db/queries/revisions";
import { setReportStatus, setCurrentRevision } from "@/db/queries/reports";
import { startRun, finishRun, recordStage } from "@/db/queries/processing";
import { audit } from "@/db/queries/audit";
import { LocalFsStorage } from "@/storage/local-fs";

export async function runProcessing(db: AppDb, ctx: TenantContext, reportId: string): Promise<void> {
  const ai = getAiRegistry();
  const storage = new LocalFsStorage();
  const runId = await startRun(db, ctx, {
    reportId, provider: ai.extraction.meta.provider, model: ai.extraction.meta.model,
    promptVersion: ai.extraction.meta.promptVersion, schemaVersion: DPR_SCHEMA_VERSION,
  });

  try {
    // Stage: validate media manifest (audio present)
    const atts = await listAttachments(db, ctx, reportId);
    const audio = atts.find((a) => a.kind === "audio");
    if (!audio) throw Object.assign(new Error("No audio attachment"), { category: "invalid_input" });
    await recordStage(db, runId, "validateManifest", "succeeded", 0);

    // Stage: transcribe
    const audioBytes = await storage.get(audio.objectKey);
    const transcript = await ai.transcription.transcribe({ audioBytes });
    await recordStage(db, runId, "transcribe", "succeeded", 0);

    // Stage: extract (schema-validated inside the port impls)
    const extracted = await ai.extraction.extract({ transcript });
    await recordStage(db, runId, "extract", "succeeded", 0);

    // Stage: deterministic validation
    const { data } = runDeterministicValidations(extracted);
    await recordStage(db, runId, "validate", "succeeded", 0);

    // Stage: summaries
    const summaries = await ai.summary.summarize({ data });
    await recordStage(db, runId, "summarize", "succeeded", 0);

    // Stage: create revision + advance state
    const rev = await addRevision(db, ctx, {
      reportId, structuredData: data, isAiGenerated: true,
      summaryInternal: summaries.internal, summaryClientSafe: summaries.clientSafe, transcript,
    });
    await setCurrentRevision(db, ctx, reportId, rev.id);
    await setReportStatus(db, ctx, reportId, "AWAITING_REVIEW");
    await recordStage(db, runId, "createRevision", "succeeded", 0);

    await finishRun(db, ctx, runId, "succeeded");
    await audit(db, ctx, { action: "report.processed", subjectRef: reportId, metadata: { runId } });
  } catch (err) {
    const category = (err as { category?: string }).category ?? "processing_error";
    await recordStage(db, runId, "pipeline", "failed", 0, category);
    await finishRun(db, ctx, runId, "failed", category);
    await setReportStatus(db, ctx, reportId, "PROCESSING_FAILED"); // inputs preserved
    await audit(db, ctx, { action: "report.processing_failed", subjectRef: reportId, metadata: { category } });
  }
}
