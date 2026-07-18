import type { TenantContext } from "@buildflow/domain/tenancy";
import type { JobRegistry } from "@buildflow/jobs/types";
import { runProcessing } from "./run";

export const REPORT_PROCESS_JOB = "report.process";

// System-context job: the pipeline re-reads everything tenant-scoped through the
// organization filter; it performs no capability-gated actions itself, so the restored
// context carries no capabilities.
export const pipelineJobRegistry: JobRegistry = {
  [REPORT_PROCESS_JOB]: async (db, payload, meta) => {
    const reportId = String(payload.reportId);
    const userId = String(payload.userId);
    const projectId = typeof payload.projectId === "string" ? payload.projectId : undefined;
    const ctx: TenantContext = {
      organizationId: meta.organizationId, projectId, userId, capabilities: [],
    };
    await runProcessing(db, ctx, reportId);
  },
};
