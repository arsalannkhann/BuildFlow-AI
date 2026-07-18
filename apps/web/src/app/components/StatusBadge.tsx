const STATUS_COPY: Record<string, { label: string; className: string }> = {
  SYNCING: { label: "Uploading files", className: "status-badge--progress" },
  UPLOADED: { label: "Upload complete", className: "status-badge--info" },
  PROCESSING: { label: "Preparing report", className: "status-badge--progress" },
  PROCESSING_FAILED: { label: "Processing failed", className: "status-badge--danger" },
  AWAITING_REVIEW: { label: "Needs review", className: "status-badge--warning" },
  REJECTED: { label: "Changes requested", className: "status-badge--danger" },
  APPROVED: { label: "Approved", className: "status-badge--success" },
  ISSUED: { label: "Issued", className: "status-badge--success" },
  SUPERSEDED: { label: "Superseded", className: "status-badge--neutral" },
};

export function StatusBadge({
  status,
  showCode = false,
}: {
  status: string;
  showCode?: boolean;
}) {
  const config = STATUS_COPY[status] ?? {
    label: status.replaceAll("_", " ").toLowerCase(),
    className: "status-badge--neutral",
  };

  return (
    <span className={`status-badge ${config.className}`}>
      <span className="status-badge__dot" aria-hidden="true" />
      <span>{showCode ? status : config.label}</span>
    </span>
  );
}
