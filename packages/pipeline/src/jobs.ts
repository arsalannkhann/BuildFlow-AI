import type { TenantContext } from "@buildflow/domain/tenancy";
import type { JobRegistry } from "@buildflow/jobs/types";
import { runProcessing } from "./run";
import { runChallanExtraction } from "./extract-documents";
import { runInvoiceExtraction } from "./extract-invoice";

export const REPORT_PROCESS_JOB = "report.process";
export const DOCUMENT_EXTRACT_JOB = "document.extract";

// System-context jobs: the pipeline re-reads everything tenant-scoped through the
// organization filter; it performs no capability-gated actions itself, so the restored
// context carries no capabilities.
const systemCtx = (payload: Record<string, unknown>, organizationId: string): TenantContext => ({
  organizationId,
  projectId: typeof payload.projectId === "string" ? payload.projectId : undefined,
  userId: String(payload.userId),
  capabilities: [],
});

export const pipelineJobRegistry: JobRegistry = {
  [REPORT_PROCESS_JOB]: async (db, payload, meta) => {
    await runProcessing(db, systemCtx(payload, meta.organizationId), String(payload.reportId));
  },
  // Commercial-document OCR (Phase D): results land as DRAFT lines for human review;
  // nothing touches stock or costs before a person reviews and posts/approves.
  [DOCUMENT_EXTRACT_JOB]: async (db, payload, meta) => {
    const kind = String(payload.documentKind);
    const ctx = systemCtx(payload, meta.organizationId);
    if (kind === "challan") {
      await runChallanExtraction(db, ctx, String(payload.receiptId));
    } else if (kind === "invoice") {
      await runInvoiceExtraction(db, ctx, String(payload.invoiceId));
    } else {
      throw new Error(`Unknown documentKind: ${kind}`);
    }
  },
};
