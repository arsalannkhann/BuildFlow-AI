export const REPORT_STATUSES = [
  "SYNCING", "UPLOADED", "PROCESSING", "PROCESSING_FAILED", "AWAITING_REVIEW",
  "REJECTED", "APPROVED", "ISSUED", "SUPERSEDED",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

const ALLOWED: Record<ReportStatus, ReportStatus[]> = {
  // SYNCING: mobile manifest accepted, attachment uploads still in flight.
  SYNCING: ["UPLOADED"],
  UPLOADED: ["PROCESSING"],
  PROCESSING: ["AWAITING_REVIEW", "PROCESSING_FAILED"],
  PROCESSING_FAILED: ["PROCESSING", "AWAITING_REVIEW"],
  AWAITING_REVIEW: ["APPROVED", "REJECTED"],
  REJECTED: ["AWAITING_REVIEW"],
  APPROVED: ["ISSUED"],
  ISSUED: ["SUPERSEDED"],
  SUPERSEDED: [],
};

export const canTransition = (from: ReportStatus, to: ReportStatus): boolean =>
  ALLOWED[from].includes(to);

export const assertTransition = (from: ReportStatus, to: ReportStatus): void => {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal transition: ${from} -> ${to}`);
  }
};
