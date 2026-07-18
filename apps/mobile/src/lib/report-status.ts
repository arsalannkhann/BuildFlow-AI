// Maps local + server report state to the exact user-facing copy of the
// design.md §7 sync/processing table. Pure TypeScript.

import type { MessageKey, MessageParams } from "./i18n";
import type { DraftSummary } from "./sync/types";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface StatusDescriptor {
  key: MessageKey;
  params?: MessageParams;
  tone: StatusTone;
  /** Text glyph rendered next to the label — status is never color-only. */
  icon: string;
}

/** Server REPORT_STATUSES → design.md §7 labels. */
export function describeServerStatus(status: string | null): StatusDescriptor {
  switch (status) {
    case "SYNCING":
      return { key: "status.waitingForNetwork", tone: "warning", icon: "…" };
    case "UPLOADED":
      return { key: "status.uploadComplete", tone: "info", icon: "✓" };
    case "PROCESSING":
      return { key: "status.preparingReport", tone: "info", icon: "⟳" };
    case "AWAITING_REVIEW":
      return { key: "status.readyForReview", tone: "success", icon: "✓" };
    case "REJECTED":
      return { key: "status.changesRequested", tone: "warning", icon: "✎" };
    case "APPROVED":
      return { key: "status.approved", tone: "success", icon: "✓" };
    case "ISSUED":
      return { key: "status.issued", tone: "success", icon: "✓" };
    case "SUPERSEDED":
      return { key: "status.superseded", tone: "neutral", icon: "↺" };
    case "PROCESSING_FAILED":
      return { key: "status.processingFailed", tone: "warning", icon: "!" };
    default:
      return { key: "status.uploadComplete", tone: "info", icon: "✓" };
  }
}

/**
 * Local draft state → §7 labels. Offline is presented as a calm queued state,
 * never as an error (design.md §2).
 */
export function describeLocalReport(report: DraftSummary, online: boolean): StatusDescriptor {
  switch (report.status) {
    case "draft":
      return { key: "status.savedOnDevice", tone: "neutral", icon: "●" };
    case "queued":
      return online
        ? {
            key: "status.uploadingFiles",
            params: { current: Math.min(report.uploadedFiles + 1, report.totalFiles), total: report.totalFiles },
            tone: "info",
            icon: "↑",
          }
        : { key: "status.waitingForNetwork", tone: "warning", icon: "…" };
    case "syncing":
      return {
        key: "status.uploadingFiles",
        params: {
          current: Math.min(report.uploadedFiles + 1, report.totalFiles),
          total: report.totalFiles,
        },
        tone: "info",
        icon: "↑",
      };
    case "failed":
      return { key: "status.needsAttention", tone: "danger", icon: "!" };
    case "synced":
      return describeServerStatus(report.serverStatus);
    default:
      return { key: "status.savedOnDevice", tone: "neutral", icon: "●" };
  }
}
