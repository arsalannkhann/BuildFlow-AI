// In-memory fake adapters for node-based vitest. NOT shipped to the app.
// The fake server mirrors the semantics of apps/web/src/core/sync-core.ts:
// manifest upsert by clientReportId, checksum-verified replay-safe uploads,
// idempotent finalize.

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
import type { LocalAttachmentRow, LocalReportRow, SyncCommandRow } from "./types";

// --------------------------------------------------------------------- crypto

/** Deterministic 64-hex "sha256" (FNV-1a based) — stable across fake usages. */
export class FakeCrypto implements CryptoAdapter {
  private nextId = 0;

  async sha256Hex(bytes: Uint8Array): Promise<string> {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (const byte of bytes) {
      h1 = Math.imul(h1 ^ byte, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + byte, 0x85ebca6b) >>> 0;
    }
    const seed = `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}${bytes.length.toString(16).padStart(8, "0")}`;
    return seed.repeat(4).slice(0, 64);
  }

  randomId(): string {
    this.nextId += 1;
    return `id-${String(this.nextId).padStart(4, "0")}`;
  }
}

// ---------------------------------------------------------------------- clock

export class FakeClock implements ClockAdapter {
  nowMs = 1_700_000_000_000;
  sleeps: number[] = [];

  nowIso(): string {
    return new Date(this.nowMs).toISOString();
  }

  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    this.nowMs += ms;
  }
}

// ---------------------------------------------------------------------- files

export class FakeFiles implements FileAdapter {
  files = new Map<string, Uint8Array>();

  put(uri: string, bytes: Uint8Array): void {
    this.files.set(uri, bytes);
  }

  async read(uri: string): Promise<Uint8Array> {
    const bytes = this.files.get(uri);
    if (!bytes) throw new Error(`File missing: ${uri}`);
    return bytes;
  }

  async delete(uri: string): Promise<void> {
    this.files.delete(uri);
  }
}

// ----------------------------------------------------------------------- auth

export class FakeAuth implements AuthAdapter {
  constructor(public token: string | null = "token-1") {}

  async getToken(): Promise<string | null> {
    return this.token;
  }
}

// ------------------------------------------------------------------------ sql

interface SqlState {
  reports: LocalReportRow[];
  attachments: LocalAttachmentRow[];
  commands: SyncCommandRow[];
  settings: Record<string, string>;
  nextSeq: number;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * In-memory stand-in for the SQLite store. Transactions snapshot state and
 * roll back on throw, matching real SQLite semantics closely enough for the
 * engine's guarantees to be exercised.
 */
export class FakeSql implements SqlAdapter {
  state: SqlState = { reports: [], attachments: [], commands: [], settings: {}, nextSeq: 1 };
  migrated = false;

  async migrate(): Promise<void> {
    this.migrated = true;
  }

  private tx(): SqlTransaction {
    return {
      insertReport: async (row: LocalReportRow) => {
        if (this.state.reports.some((r) => r.clientReportId === row.clientReportId)) {
          throw new Error("PRIMARY KEY violation: local_reports");
        }
        this.state.reports.push(clone(row));
      },
      insertAttachment: async (row: LocalAttachmentRow) => {
        if (this.state.attachments.some((a) => a.clientAttachmentId === row.clientAttachmentId)) {
          throw new Error("PRIMARY KEY violation: local_attachments");
        }
        this.state.attachments.push(clone(row));
      },
      insertCommand: async (command: NewCommand) => {
        this.state.commands.push({
          seq: this.state.nextSeq++,
          kind: command.kind,
          clientReportId: command.clientReportId,
          clientAttachmentId: command.clientAttachmentId,
          attempts: 0,
          lastError: null,
          state: "pending",
        });
      },
      updateReport: async (id: string, patch: ReportPatch) => this.updateReport(id, patch),
      updateAttachment: async (id: string, patch: AttachmentPatch) =>
        this.updateAttachment(id, patch),
      updateCommand: async (seq: number, patch: CommandPatch) => this.updateCommand(seq, patch),
      deleteReportCascade: async (id: string) => {
        this.state.reports = this.state.reports.filter((r) => r.clientReportId !== id);
        this.state.attachments = this.state.attachments.filter((a) => a.clientReportId !== id);
        this.state.commands = this.state.commands.filter((c) => c.clientReportId !== id);
      },
    };
  }

  async transaction<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const snapshot = clone(this.state);
    try {
      return await fn(this.tx());
    } catch (error) {
      this.state = snapshot; // rollback
      throw error;
    }
  }

  async getReport(clientReportId: string): Promise<LocalReportRow | null> {
    return clone(this.state.reports.find((r) => r.clientReportId === clientReportId) ?? null);
  }

  async listReports(): Promise<LocalReportRow[]> {
    return clone(this.state.reports);
  }

  async getAttachment(clientAttachmentId: string): Promise<LocalAttachmentRow | null> {
    return clone(
      this.state.attachments.find((a) => a.clientAttachmentId === clientAttachmentId) ?? null,
    );
  }

  async listAttachments(clientReportId: string): Promise<LocalAttachmentRow[]> {
    return clone(this.state.attachments.filter((a) => a.clientReportId === clientReportId));
  }

  async listCommands(clientReportId?: string): Promise<SyncCommandRow[]> {
    const commands = clientReportId
      ? this.state.commands.filter((c) => c.clientReportId === clientReportId)
      : this.state.commands;
    return clone([...commands].sort((a, b) => a.seq - b.seq));
  }

  async nextRunnableCommand(): Promise<SyncCommandRow | null> {
    const blockedReports = new Set(
      this.state.commands.filter((c) => c.state === "failed").map((c) => c.clientReportId),
    );
    const runnable = [...this.state.commands]
      .sort((a, b) => a.seq - b.seq)
      .find((c) => c.state === "pending" && !blockedReports.has(c.clientReportId));
    return clone(runnable ?? null);
  }

  async countPendingCommands(): Promise<number> {
    return this.state.commands.filter((c) => c.state === "pending").length;
  }

  async updateReport(clientReportId: string, patch: ReportPatch): Promise<void> {
    const row = this.state.reports.find((r) => r.clientReportId === clientReportId);
    if (!row) throw new Error(`No local_report ${clientReportId}`);
    Object.assign(row, clone(patch));
  }

  async updateAttachment(clientAttachmentId: string, patch: AttachmentPatch): Promise<void> {
    const row = this.state.attachments.find((a) => a.clientAttachmentId === clientAttachmentId);
    if (!row) throw new Error(`No local_attachment ${clientAttachmentId}`);
    Object.assign(row, clone(patch));
  }

  async updateCommand(seq: number, patch: CommandPatch): Promise<void> {
    const row = this.state.commands.find((c) => c.seq === seq);
    if (!row) throw new Error(`No sync_command ${seq}`);
    Object.assign(row, clone(patch));
  }

  async getSetting(key: string): Promise<string | null> {
    return this.state.settings[key] ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.state.settings[key] = value;
  }
}

// --------------------------------------------------------------------- server

export interface RecordedRequest {
  method: string;
  url: string;
  bodyText: string | null;
  bodyBytes: Uint8Array | null;
  headers: Record<string, string>;
}

interface ServerAttachment {
  attachmentId: string;
  clientAttachmentId: string;
  kind: string;
  contentType: string;
  byteSize: number;
  checksum: string;
  uploaded: boolean;
  bytes: Uint8Array | null;
}

interface ServerReport {
  reportId: string;
  clientReportId: string;
  projectId: string;
  reportDate: string;
  note: string | null;
  status: string;
  attachments: ServerAttachment[];
}

/** One entry consumed per incoming request. */
export type PlannedFailure =
  | { kind: "network" } // request never reaches the server
  | { kind: "drop-response" } // server processes it, response is lost
  | { kind: "status"; status: number; title: string; detail?: string };

/**
 * Contract-faithful fake of the /v1 sync endpoints. Records every request so
 * tests can assert exact call sequences and payload equality across retries.
 */
export class FakeServer {
  requests: RecordedRequest[] = [];
  failures: PlannedFailure[] = [];
  validToken = "token-1";
  reports = new Map<string, ServerReport>(); // by clientReportId
  private nextId = 0;

  constructor(
    private readonly crypto: CryptoAdapter,
    readonly baseUrl = "http://api.test",
  ) {}

  planFailures(...failures: PlannedFailure[]): void {
    this.failures.push(...failures);
  }

  requestsFor(method: string, pathPart: string): RecordedRequest[] {
    return this.requests.filter((r) => r.method === method && r.url.includes(pathPart));
  }

  http(): HttpAdapter {
    return { request: (request) => this.handle(request) };
  }

  private problem(status: number, title: string, detail?: string): HttpResponse {
    return {
      status,
      bodyText: JSON.stringify({ type: "about:blank", title, status, detail, traceId: "t-1" }),
    };
  }

  private async handle(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push({
      method: request.method,
      url: request.url,
      bodyText: typeof request.body === "string" ? request.body : null,
      bodyBytes: request.body instanceof Uint8Array ? request.body : null,
      headers: { ...request.headers },
    });

    const failure = this.failures.shift();
    if (failure?.kind === "network") throw new HttpTransportError("Network request failed");
    if (failure?.kind === "status") {
      return this.problem(failure.status, failure.title, failure.detail);
    }

    const respond = await this.route(request);
    if (failure?.kind === "drop-response") {
      throw new HttpTransportError("Connection reset while reading response");
    }
    return respond;
  }

  private async route(request: HttpRequest): Promise<HttpResponse> {
    if (request.headers["authorization"] !== `Bearer ${this.validToken}`) {
      return this.problem(401, "Session invalid or expired");
    }
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && path === "/api/v1/reports") {
      return this.handleManifest(String(request.body));
    }
    const upload = path.match(/^\/api\/v1\/reports\/([^/]+)\/attachments\/([^/]+)\/content$/);
    if (request.method === "PUT" && upload) {
      const [, reportId, attachmentId] = upload;
      return this.handleUpload(reportId as string, attachmentId as string, request.body);
    }
    const finalize = path.match(/^\/api\/v1\/reports\/([^/]+)\/finalize$/);
    if (request.method === "POST" && finalize) {
      return this.handleFinalize(finalize[1] as string);
    }
    return this.problem(404, "Not found");
  }

  private handleManifest(bodyText: string): HttpResponse {
    const body = JSON.parse(bodyText) as {
      clientReportId: string;
      projectId: string;
      reportDate: string;
      note?: string;
      attachments: {
        clientAttachmentId: string;
        kind: string;
        contentType: string;
        byteSize: number;
        checksum: string;
      }[];
    };
    if (!body.attachments.some((a) => a.kind === "audio")) {
      return this.problem(422, "A report needs at least one audio attachment");
    }

    // Idempotent upsert by clientReportId (mirrors upsertReportManifest).
    let report = this.reports.get(body.clientReportId);
    if (!report) {
      this.nextId += 1;
      report = {
        reportId: `srv-report-${this.nextId}`,
        clientReportId: body.clientReportId,
        projectId: body.projectId,
        reportDate: body.reportDate,
        note: body.note ?? null,
        status: "SYNCING",
        attachments: [],
      };
      this.reports.set(body.clientReportId, report);
    }
    for (const item of body.attachments) {
      let attachment = report.attachments.find(
        (a) => a.clientAttachmentId === item.clientAttachmentId,
      );
      if (!attachment) {
        this.nextId += 1;
        attachment = {
          attachmentId: `srv-att-${this.nextId}`,
          clientAttachmentId: item.clientAttachmentId,
          kind: item.kind,
          contentType: item.contentType,
          byteSize: item.byteSize,
          checksum: item.checksum,
          uploaded: false,
          bytes: null,
        };
        report.attachments.push(attachment);
      }
    }
    return {
      status: 200,
      bodyText: JSON.stringify({
        reportId: report.reportId,
        status: report.status,
        attachments: report.attachments.map((a) => ({
          clientAttachmentId: a.clientAttachmentId,
          attachmentId: a.attachmentId,
          uploaded: a.uploaded,
          uploadUrl: `${this.baseUrl}/api/v1/reports/${report.reportId}/attachments/${a.attachmentId}/content`,
        })),
      }),
    };
  }

  private async handleUpload(
    reportId: string,
    attachmentId: string,
    body: string | Uint8Array | undefined,
  ): Promise<HttpResponse> {
    const report = [...this.reports.values()].find((r) => r.reportId === reportId);
    const attachment = report?.attachments.find((a) => a.attachmentId === attachmentId);
    if (!report || !attachment) return this.problem(404, "Attachment not found");
    if (attachment.uploaded) return { status: 200, bodyText: JSON.stringify({ uploaded: true }) };
    if (!(body instanceof Uint8Array) || body.byteLength === 0) {
      return this.problem(400, "Empty body");
    }
    const checksum = await this.crypto.sha256Hex(body);
    if (checksum !== attachment.checksum) return this.problem(422, "Checksum mismatch");
    if (body.byteLength !== attachment.byteSize) return this.problem(422, "Size mismatch");
    attachment.bytes = body;
    attachment.uploaded = true;
    return { status: 200, bodyText: JSON.stringify({ uploaded: true }) };
  }

  private handleFinalize(reportId: string): HttpResponse {
    const report = [...this.reports.values()].find((r) => r.reportId === reportId);
    if (!report) return this.problem(404, "Report not found");
    if (report.status !== "SYNCING") {
      return { status: 200, bodyText: JSON.stringify({ reportId, status: report.status }) };
    }
    const pending = report.attachments.filter((a) => !a.uploaded);
    if (pending.length > 0) {
      return this.problem(409, `Uploads incomplete: ${pending.length} attachment(s) pending`);
    }
    report.status = "PROCESSING";
    return { status: 200, bodyText: JSON.stringify({ reportId, status: report.status }) };
  }
}
