// Local persistence model for the offline sync engine (Architecture.MD §10).
// Pure TypeScript: no react-native or expo imports — this module is exercised
// by node-based vitest through the fake adapters.

export type LocalReportStatus = "draft" | "queued" | "syncing" | "synced" | "failed";
export type AttachmentKind = "audio" | "photo" | "document";
export type CommandKind = "create_manifest" | "upload_attachment" | "finalize";
export type CommandState = "pending" | "done" | "failed";

/** Row of the `local_reports` table. */
export interface LocalReportRow {
  clientReportId: string;
  projectId: string;
  reportDate: string; // YYYY-MM-DD
  note: string | null;
  status: LocalReportStatus;
  serverReportId: string | null;
  /** Last authoritative status seen from the server (REPORT_STATUSES). */
  serverStatus: string | null;
  createdAt: string; // ISO 8601
}

/** Row of the `local_attachments` table. */
export interface LocalAttachmentRow {
  clientAttachmentId: string;
  clientReportId: string;
  kind: AttachmentKind;
  fileUri: string;
  contentType: string;
  byteSize: number;
  /** sha256 hex, computed on device at capture time; never recomputed after. */
  checksum: string;
  capturedAt: string | null; // ISO 8601 with offset when known
  uploaded: 0 | 1;
  serverAttachmentId: string | null;
  uploadUrl: string | null;
}

/** Row of the `sync_commands` table. Ordered, idempotent command log. */
export interface SyncCommandRow {
  seq: number; // INTEGER PRIMARY KEY AUTOINCREMENT
  kind: CommandKind;
  clientReportId: string;
  clientAttachmentId: string | null;
  attempts: number;
  lastError: string | null;
  state: CommandState;
}

/** Input for a new capture. Checksums/sizes are computed by the engine. */
export interface CaptureAttachmentInput {
  kind: AttachmentKind;
  fileUri: string;
  contentType: string;
  capturedAt?: string; // ISO 8601 with offset (EXIF or device clock)
}

export interface CaptureInput {
  projectId: string;
  reportDate: string; // YYYY-MM-DD
  note?: string;
  attachments: CaptureAttachmentInput[];
}

/** Per-report view for the Today/Reports screens. */
export interface DraftSummary {
  clientReportId: string;
  projectId: string;
  reportDate: string;
  note: string | null;
  status: LocalReportStatus;
  serverReportId: string | null;
  serverStatus: string | null;
  createdAt: string;
  totalFiles: number;
  uploadedFiles: number;
  /** Problem detail from the first failed command, if any. */
  lastError: string | null;
}

export interface SyncSummary {
  pendingCommands: number;
  authRequired: boolean;
  reports: DraftSummary[];
}

export type DrainOutcome =
  | { kind: "idle" } // queue was already empty
  | { kind: "drained"; processed: number } // processed everything runnable
  | { kind: "backoff"; seq: number; attempts: number } // retryable failure persists; retry later
  | { kind: "auth-required" } // 401 — paused until resumeAfterAuth()
  | { kind: "already-draining" };
