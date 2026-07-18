// Adapter ports for the offline sync engine.
//
// The engine (engine.ts) is pure TypeScript and receives every side effect
// through these interfaces so the whole queue can run under node-based vitest
// with in-memory fakes (fakes.ts). The production implementations backed by
// expo-sqlite / expo-file-system / expo/fetch / expo-crypto live in
// expo-adapters.ts, which tests must never import.
//
// SqlAdapter is a *typed* port over the three SQLite tables (local_reports,
// local_attachments, sync_commands — see expo-adapters.ts for the exact DDL)
// rather than a raw `exec(sql)` surface: the fake would otherwise need a SQL
// interpreter, and a typed port keeps every query strict-checked.

import type {
  CommandState,
  LocalAttachmentRow,
  LocalReportRow,
  LocalReportStatus,
  SyncCommandRow,
} from "./types";

export interface ReportPatch {
  status?: LocalReportStatus;
  serverReportId?: string;
  serverStatus?: string;
  note?: string | null;
}

export interface AttachmentPatch {
  uploaded?: 0 | 1;
  serverAttachmentId?: string;
  uploadUrl?: string;
}

export interface CommandPatch {
  state?: CommandState;
  attempts?: number;
  lastError?: string | null;
}

export interface NewCommand {
  kind: SyncCommandRow["kind"];
  clientReportId: string;
  clientAttachmentId: string | null;
}

/** Writes available inside a transaction. All-or-nothing on throw. */
export interface SqlTransaction {
  insertReport(row: LocalReportRow): Promise<void>;
  insertAttachment(row: LocalAttachmentRow): Promise<void>;
  /** Appends to sync_commands; seq assigned by AUTOINCREMENT order of insertion. */
  insertCommand(command: NewCommand): Promise<void>;
  updateReport(clientReportId: string, patch: ReportPatch): Promise<void>;
  updateAttachment(clientAttachmentId: string, patch: AttachmentPatch): Promise<void>;
  updateCommand(seq: number, patch: CommandPatch): Promise<void>;
  deleteReportCascade(clientReportId: string): Promise<void>;
}

export interface SqlAdapter {
  /** Creates tables if missing. Safe to call on every app start. */
  migrate(): Promise<void>;
  transaction<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T>;

  getReport(clientReportId: string): Promise<LocalReportRow | null>;
  listReports(): Promise<LocalReportRow[]>;
  getAttachment(clientAttachmentId: string): Promise<LocalAttachmentRow | null>;
  listAttachments(clientReportId: string): Promise<LocalAttachmentRow[]>;
  listCommands(clientReportId?: string): Promise<SyncCommandRow[]>;
  /**
   * Lowest-seq pending command whose report has no permanently failed command.
   * A 4xx-failed command blocks only its own report; other reports keep syncing.
   */
  nextRunnableCommand(): Promise<SyncCommandRow | null>;
  countPendingCommands(): Promise<number>;

  updateReport(clientReportId: string, patch: ReportPatch): Promise<void>;
  updateAttachment(clientAttachmentId: string, patch: AttachmentPatch): Promise<void>;
  updateCommand(seq: number, patch: CommandPatch): Promise<void>;

  /** Small key/value store (language, cached /me payload, ...). */
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

export interface FileAdapter {
  /** Reads the full file. Throws if the file is missing. */
  read(uri: string): Promise<Uint8Array>;
  /** Deletes if present; must not throw when already gone. */
  delete(uri: string): Promise<void>;
}

export interface HttpRequest {
  method: "GET" | "POST" | "PUT";
  url: string;
  headers: Record<string, string>;
  body?: string | Uint8Array;
}

export interface HttpResponse {
  status: number;
  bodyText: string;
}

/**
 * Thrown by HttpAdapter implementations when no HTTP response was obtained
 * (offline, DNS failure, timeout, connection reset). The engine treats it as
 * retryable and never as a server rejection.
 */
export class HttpTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpTransportError";
  }
}

export interface HttpAdapter {
  /** Resolves with the response for ANY HTTP status; throws HttpTransportError otherwise. */
  request(request: HttpRequest): Promise<HttpResponse>;
}

export interface ClockAdapter {
  nowIso(): string;
  sleep(ms: number): Promise<void>;
}

export interface CryptoAdapter {
  sha256Hex(bytes: Uint8Array): Promise<string>;
  randomId(): string;
}

export interface AuthAdapter {
  /** Current session token, or null when signed out. */
  getToken(): Promise<string | null>;
}

export interface SyncEngineDeps {
  sql: SqlAdapter;
  file: FileAdapter;
  http: HttpAdapter;
  clock: ClockAdapter;
  crypto: CryptoAdapter;
  auth: AuthAdapter;
  config: SyncEngineConfig;
}

export interface SyncEngineConfig {
  /** e.g. http://10.0.2.2:3000 — no trailing slash. */
  apiBaseUrl: string;
  /** Retryable attempts on one command within a single drain() call. */
  maxAttemptsPerDrain?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
}
