// Production adapter implementations backed by Expo APIs.
// This module is imported ONLY by the app runtime — never by tests, which use
// the pure in-memory fakes (fakes.ts).

import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import { fetch as expoFetch } from "expo/fetch";
import { SESSION_TOKEN_KEY } from "../config";
import type {
  AttachmentPatch,
  AuthAdapter,
  ClockAdapter,
  CommandPatch,
  CryptoAdapter,
  FileAdapter,
  HttpAdapter,
  HttpRequest,
  HttpResponse,
  NewCommand,
  ReportPatch,
  SqlAdapter,
  SqlTransaction,
} from "./adapters";
import { HttpTransportError } from "./adapters";
import { SyncEngine } from "./engine";
import type {
  AttachmentKind,
  CommandKind,
  CommandState,
  LocalAttachmentRow,
  LocalReportRow,
  LocalReportStatus,
  SyncCommandRow,
} from "./types";

// ------------------------------------------------------------------- SQLite

// Exact local schema (Architecture.MD §10). Kept as one idempotent script so
// migrate() is safe on every app start.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS local_reports (
  client_report_id TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL,
  report_date      TEXT NOT NULL,
  note             TEXT,
  status           TEXT NOT NULL CHECK (status IN ('draft','queued','syncing','synced','failed')),
  server_report_id TEXT,
  server_status    TEXT,
  created_at       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_attachments (
  client_attachment_id TEXT PRIMARY KEY,
  client_report_id     TEXT NOT NULL REFERENCES local_reports(client_report_id),
  kind                 TEXT NOT NULL CHECK (kind IN ('audio','photo','document')),
  file_uri             TEXT NOT NULL,
  content_type         TEXT NOT NULL,
  byte_size            INTEGER NOT NULL,
  checksum             TEXT NOT NULL,
  captured_at          TEXT,
  uploaded             INTEGER NOT NULL DEFAULT 0,
  server_attachment_id TEXT,
  upload_url           TEXT
);
CREATE TABLE IF NOT EXISTS sync_commands (
  seq                  INTEGER PRIMARY KEY AUTOINCREMENT,
  kind                 TEXT NOT NULL CHECK (kind IN ('create_manifest','upload_attachment','finalize')),
  client_report_id     TEXT NOT NULL,
  client_attachment_id TEXT,
  attempts             INTEGER NOT NULL DEFAULT 0,
  last_error           TEXT,
  state                TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','done','failed'))
);
CREATE INDEX IF NOT EXISTS idx_sync_commands_state ON sync_commands (state, seq);
CREATE INDEX IF NOT EXISTS idx_local_attachments_report ON local_attachments (client_report_id);
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

interface ReportDbRow {
  client_report_id: string;
  project_id: string;
  report_date: string;
  note: string | null;
  status: string;
  server_report_id: string | null;
  server_status: string | null;
  created_at: string;
}

interface AttachmentDbRow {
  client_attachment_id: string;
  client_report_id: string;
  kind: string;
  file_uri: string;
  content_type: string;
  byte_size: number;
  checksum: string;
  captured_at: string | null;
  uploaded: number;
  server_attachment_id: string | null;
  upload_url: string | null;
}

interface CommandDbRow {
  seq: number;
  kind: string;
  client_report_id: string;
  client_attachment_id: string | null;
  attempts: number;
  last_error: string | null;
  state: string;
}

const toReport = (row: ReportDbRow): LocalReportRow => ({
  clientReportId: row.client_report_id,
  projectId: row.project_id,
  reportDate: row.report_date,
  note: row.note,
  status: row.status as LocalReportStatus,
  serverReportId: row.server_report_id,
  serverStatus: row.server_status,
  createdAt: row.created_at,
});

const toAttachment = (row: AttachmentDbRow): LocalAttachmentRow => ({
  clientAttachmentId: row.client_attachment_id,
  clientReportId: row.client_report_id,
  kind: row.kind as AttachmentKind,
  fileUri: row.file_uri,
  contentType: row.content_type,
  byteSize: row.byte_size,
  checksum: row.checksum,
  capturedAt: row.captured_at,
  uploaded: row.uploaded === 1 ? 1 : 0,
  serverAttachmentId: row.server_attachment_id,
  uploadUrl: row.upload_url,
});

const toCommand = (row: CommandDbRow): SyncCommandRow => ({
  seq: row.seq,
  kind: row.kind as CommandKind,
  clientReportId: row.client_report_id,
  clientAttachmentId: row.client_attachment_id,
  attempts: row.attempts,
  lastError: row.last_error,
  state: row.state as CommandState,
});

/** Any handle that can run parameterized statements (db or transaction). */
type SqlRunner = Pick<SQLite.SQLiteDatabase, "runAsync">;

type SqlValue = string | number | null;

function buildSet(patch: Record<string, SqlValue | undefined>): {
  clause: string;
  values: SqlValue[];
} {
  const columns: string[] = [];
  const values: SqlValue[] = [];
  for (const [column, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    columns.push(`${column} = ?`);
    values.push(value);
  }
  return { clause: columns.join(", "), values };
}

const reportPatchColumns = (patch: ReportPatch): Record<string, SqlValue | undefined> => ({
  status: patch.status,
  server_report_id: patch.serverReportId,
  server_status: patch.serverStatus,
  note: patch.note,
});

const attachmentPatchColumns = (patch: AttachmentPatch): Record<string, SqlValue | undefined> => ({
  uploaded: patch.uploaded,
  server_attachment_id: patch.serverAttachmentId,
  upload_url: patch.uploadUrl,
});

const commandPatchColumns = (patch: CommandPatch): Record<string, SqlValue | undefined> => ({
  state: patch.state,
  attempts: patch.attempts,
  last_error: patch.lastError,
});

async function updateReportRow(
  runner: SqlRunner,
  clientReportId: string,
  patch: ReportPatch,
): Promise<void> {
  const { clause, values } = buildSet(reportPatchColumns(patch));
  if (!clause) return;
  await runner.runAsync(
    `UPDATE local_reports SET ${clause} WHERE client_report_id = ?`,
    [...values, clientReportId],
  );
}

async function updateAttachmentRow(
  runner: SqlRunner,
  clientAttachmentId: string,
  patch: AttachmentPatch,
): Promise<void> {
  const { clause, values } = buildSet(attachmentPatchColumns(patch));
  if (!clause) return;
  await runner.runAsync(
    `UPDATE local_attachments SET ${clause} WHERE client_attachment_id = ?`,
    [...values, clientAttachmentId],
  );
}

async function updateCommandRow(
  runner: SqlRunner,
  seq: number,
  patch: CommandPatch,
): Promise<void> {
  const { clause, values } = buildSet(commandPatchColumns(patch));
  if (!clause) return;
  await runner.runAsync(`UPDATE sync_commands SET ${clause} WHERE seq = ?`, [...values, seq]);
}

function transactionApi(runner: SqlRunner): SqlTransaction {
  return {
    insertReport: async (row: LocalReportRow) => {
      await runner.runAsync(
        `INSERT INTO local_reports
           (client_report_id, project_id, report_date, note, status, server_report_id, server_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.clientReportId,
          row.projectId,
          row.reportDate,
          row.note,
          row.status,
          row.serverReportId,
          row.serverStatus,
          row.createdAt,
        ],
      );
    },
    insertAttachment: async (row: LocalAttachmentRow) => {
      await runner.runAsync(
        `INSERT INTO local_attachments
           (client_attachment_id, client_report_id, kind, file_uri, content_type, byte_size,
            checksum, captured_at, uploaded, server_attachment_id, upload_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.clientAttachmentId,
          row.clientReportId,
          row.kind,
          row.fileUri,
          row.contentType,
          row.byteSize,
          row.checksum,
          row.capturedAt,
          row.uploaded,
          row.serverAttachmentId,
          row.uploadUrl,
        ],
      );
    },
    insertCommand: async (command: NewCommand) => {
      await runner.runAsync(
        `INSERT INTO sync_commands (kind, client_report_id, client_attachment_id, attempts, state)
         VALUES (?, ?, ?, 0, 'pending')`,
        [command.kind, command.clientReportId, command.clientAttachmentId],
      );
    },
    updateReport: (id, patch) => updateReportRow(runner, id, patch),
    updateAttachment: (id, patch) => updateAttachmentRow(runner, id, patch),
    updateCommand: (seq, patch) => updateCommandRow(runner, seq, patch),
    deleteReportCascade: async (clientReportId: string) => {
      await runner.runAsync(`DELETE FROM sync_commands WHERE client_report_id = ?`, [clientReportId]);
      await runner.runAsync(`DELETE FROM local_attachments WHERE client_report_id = ?`, [clientReportId]);
      await runner.runAsync(`DELETE FROM local_reports WHERE client_report_id = ?`, [clientReportId]);
    },
  };
}

export class ExpoSqlAdapter implements SqlAdapter {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  static async open(databaseName = "buildflow.db"): Promise<ExpoSqlAdapter> {
    const db = await SQLite.openDatabaseAsync(databaseName);
    await db.execAsync("PRAGMA journal_mode = WAL;");
    return new ExpoSqlAdapter(db);
  }

  async migrate(): Promise<void> {
    await this.db.execAsync(SCHEMA);
  }

  async transaction<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    let result: T | undefined;
    // withExclusiveTransactionAsync commits on resolve and rolls back on throw.
    await this.db.withExclusiveTransactionAsync(async (txn) => {
      result = await fn(transactionApi(txn));
    });
    return result as T;
  }

  async getReport(clientReportId: string): Promise<LocalReportRow | null> {
    const rows = await this.db.getAllAsync<ReportDbRow>(
      `SELECT * FROM local_reports WHERE client_report_id = ?`,
      [clientReportId],
    );
    return rows[0] ? toReport(rows[0]) : null;
  }

  async listReports(): Promise<LocalReportRow[]> {
    const rows = await this.db.getAllAsync<ReportDbRow>(
      `SELECT * FROM local_reports ORDER BY created_at DESC`,
    );
    return rows.map(toReport);
  }

  async getAttachment(clientAttachmentId: string): Promise<LocalAttachmentRow | null> {
    const rows = await this.db.getAllAsync<AttachmentDbRow>(
      `SELECT * FROM local_attachments WHERE client_attachment_id = ?`,
      [clientAttachmentId],
    );
    return rows[0] ? toAttachment(rows[0]) : null;
  }

  async listAttachments(clientReportId: string): Promise<LocalAttachmentRow[]> {
    const rows = await this.db.getAllAsync<AttachmentDbRow>(
      `SELECT * FROM local_attachments WHERE client_report_id = ? ORDER BY rowid ASC`,
      [clientReportId],
    );
    return rows.map(toAttachment);
  }

  async listCommands(clientReportId?: string): Promise<SyncCommandRow[]> {
    const rows = clientReportId
      ? await this.db.getAllAsync<CommandDbRow>(
          `SELECT * FROM sync_commands WHERE client_report_id = ? ORDER BY seq ASC`,
          [clientReportId],
        )
      : await this.db.getAllAsync<CommandDbRow>(`SELECT * FROM sync_commands ORDER BY seq ASC`);
    return rows.map(toCommand);
  }

  async nextRunnableCommand(): Promise<SyncCommandRow | null> {
    const rows = await this.db.getAllAsync<CommandDbRow>(
      `SELECT * FROM sync_commands
       WHERE state = 'pending'
         AND client_report_id NOT IN (
           SELECT client_report_id FROM sync_commands WHERE state = 'failed'
         )
       ORDER BY seq ASC
       LIMIT 1`,
    );
    return rows[0] ? toCommand(rows[0]) : null;
  }

  async countPendingCommands(): Promise<number> {
    const rows = await this.db.getAllAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sync_commands WHERE state = 'pending'`,
    );
    return rows[0]?.n ?? 0;
  }

  updateReport(clientReportId: string, patch: ReportPatch): Promise<void> {
    return updateReportRow(this.db, clientReportId, patch);
  }

  updateAttachment(clientAttachmentId: string, patch: AttachmentPatch): Promise<void> {
    return updateAttachmentRow(this.db, clientAttachmentId, patch);
  }

  updateCommand(seq: number, patch: CommandPatch): Promise<void> {
    return updateCommandRow(this.db, seq, patch);
  }

  async getSetting(key: string): Promise<string | null> {
    const rows = await this.db.getAllAsync<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = ?`,
      [key],
    );
    return rows[0]?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }
}

// -------------------------------------------------------------------- files

export class ExpoFileAdapter implements FileAdapter {
  async read(uri: string): Promise<Uint8Array> {
    const file = new File(uri);
    if (!file.exists) throw new Error(`File missing: ${uri}`);
    return file.bytes();
  }

  async delete(uri: string): Promise<void> {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Already gone or inaccessible — deletion is best-effort by contract.
    }
  }
}

// --------------------------------------------------------------------- http

/**
 * DOM BodyInit/BufferSource require views backed by a plain ArrayBuffer.
 * Adapter callers hand us `Uint8Array<ArrayBufferLike>`; this narrows (or, in
 * the SharedArrayBuffer edge case, copies) to a strict view.
 */
function asStrictBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes as Uint8Array<ArrayBuffer>;
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export class ExpoHttpAdapter implements HttpAdapter {
  async request(request: HttpRequest): Promise<HttpResponse> {
    try {
      const response = await expoFetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body instanceof Uint8Array ? asStrictBytes(request.body) : request.body,
      });
      const bodyText = await response.text();
      return { status: response.status, bodyText };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HttpTransportError(message);
    }
  }
}

// -------------------------------------------------------------- clock/crypto

export class ExpoClockAdapter implements ClockAdapter {
  nowIso(): string {
    return new Date().toISOString();
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class ExpoCryptoAdapter implements CryptoAdapter {
  async sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, asStrictBytes(bytes));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  randomId(): string {
    return Crypto.randomUUID();
  }
}

// --------------------------------------------------------------------- auth

export class SecureStoreAuthAdapter implements AuthAdapter {
  async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  }
}

// --------------------------------------------------------------------- boot

export interface ExpoSyncServices {
  engine: SyncEngine;
  sql: ExpoSqlAdapter;
}

/** Opens the local database and returns a ready (migrated) sync engine. */
export async function createExpoSyncServices(apiBaseUrl: string): Promise<ExpoSyncServices> {
  const sql = await ExpoSqlAdapter.open();
  const engine = new SyncEngine({
    sql,
    file: new ExpoFileAdapter(),
    http: new ExpoHttpAdapter(),
    clock: new ExpoClockAdapter(),
    crypto: new ExpoCryptoAdapter(),
    auth: new SecureStoreAuthAdapter(),
    config: { apiBaseUrl },
  });
  await engine.init();
  return { engine, sql };
}
