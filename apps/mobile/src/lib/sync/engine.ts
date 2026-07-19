// Offline-first sync engine (Architecture.MD §10, rules.md §10).
//
// Invariants:
// - Submitting a capture is ONE local SQLite transaction inserting the report,
//   its attachments, and the ordered commands (create_manifest, one
//   upload_attachment per file, finalize). The user-facing ack ("Saved on this
//   device") comes from that local commit — never from the network.
// - drain() executes sync_commands strictly in seq order. Every command is
//   idempotent against the server (manifest upserts by clientReportId, upload
//   PUT is checksum-verified and replay-safe, finalize is a no-op once
//   processed), so re-running after network loss or process death cannot
//   duplicate anything.
// - HTTP 5xx / transport errors: exponential backoff, same command retried,
//   never skipped. Other 4xx: the command is marked failed with the problem
//   detail and is not retried automatically; it blocks only its own report.
//   401 pauses the whole queue until resumeAfterAuth().
//
// Pure TypeScript: all side effects arrive through the injected adapters.

import type { HttpResponse, SqlAdapter, SyncEngineDeps } from "./adapters";
import {
  apiPaths,
  createReportRequest,
  createReportResponse,
  describeProblem,
  finalizeReportResponse,
  parseJson,
  uploadResponse,
  type CreateReportRequest,
} from "./api";
import type {
  CaptureInput,
  DraftSummary,
  DrainOutcome,
  LocalAttachmentRow,
  LocalReportRow,
  SyncCommandRow,
  SyncSummary,
} from "./types";

/** Server rejected the command (non-retryable 4xx). Carries the problem detail. */
class PermanentCommandError extends Error {}
/** Session token missing/expired — queue pauses until re-auth. */
class AuthRequiredError extends Error {}
/** Transient failure (network, 5xx, 408/409/429) — retry with backoff. */
class RetryableCommandError extends Error {}

const DEFAULT_MAX_ATTEMPTS_PER_DRAIN = 4;
const DEFAULT_BACKOFF_BASE_MS = 1_000;
const DEFAULT_BACKOFF_CAP_MS = 60_000;

export class SyncEngine {
  private readonly sql: SqlAdapter;
  private readonly deps: SyncEngineDeps;
  private readonly listeners = new Set<() => void>();
  private draining = false;
  private authRequired = false;

  constructor(deps: SyncEngineDeps) {
    this.deps = deps;
    this.sql = deps.sql;
  }

  /** Idempotent start-up: ensures the schema exists. Queue state lives in SQLite. */
  async init(): Promise<void> {
    await this.sql.migrate();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  get isAuthRequired(): boolean {
    return this.authRequired;
  }

  // ----------------------------------------------------------------- capture

  /**
   * Durable local save + enqueue in one transaction. Returns once the commit
   * succeeded — the caller may show "Saved on this device" immediately.
   */
  async submitCapture(input: CaptureInput): Promise<{ clientReportId: string }> {
    const clientReportId = await this.persistCapture(input, true);
    return { clientReportId };
  }

  /** "Save and finish later": durable local save without enqueueing sync. */
  async saveDraft(input: CaptureInput): Promise<{ clientReportId: string }> {
    const clientReportId = await this.persistCapture(input, false);
    return { clientReportId };
  }

  /** Enqueues a previously saved draft for sync. */
  async submitDraft(clientReportId: string): Promise<void> {
    const report = await this.sql.getReport(clientReportId);
    if (!report) throw new Error(`Unknown draft: ${clientReportId}`);
    if (report.status !== "draft") return; // already queued or beyond
    const attachments = await this.sql.listAttachments(clientReportId);
    this.assertHasAudio(attachments.map((a) => a.kind));
    await this.sql.transaction(async (tx) => {
      await tx.updateReport(clientReportId, { status: "queued" });
      await this.enqueueCommands(tx, clientReportId, attachments);
    });
    this.emit();
  }

  private assertHasAudio(kinds: readonly string[]): void {
    if (!kinds.includes("audio")) {
      throw new Error("A report needs at least one audio attachment");
    }
  }

  private async persistCapture(input: CaptureInput, enqueue: boolean): Promise<string> {
    if (input.attachments.length === 0) throw new Error("Nothing to save");
    this.assertHasAudio(input.attachments.map((a) => a.kind));

    const { crypto, file, clock } = this.deps;
    const clientReportId = crypto.randomId();
    const attachmentRows: LocalAttachmentRow[] = [];
    // Checksums are computed once, on-device, before the durable save; they
    // travel unchanged through manifest and upload verification.
    for (const attachment of input.attachments) {
      const bytes = await file.read(attachment.fileUri);
      attachmentRows.push({
        clientAttachmentId: crypto.randomId(),
        clientReportId,
        kind: attachment.kind,
        fileUri: attachment.fileUri,
        contentType: attachment.contentType,
        byteSize: bytes.byteLength,
        checksum: await crypto.sha256Hex(bytes),
        capturedAt: attachment.capturedAt ?? null,
        uploaded: 0,
        serverAttachmentId: null,
        uploadUrl: null,
      });
    }

    const reportRow: LocalReportRow = {
      clientReportId,
      projectId: input.projectId,
      reportDate: input.reportDate,
      note: input.note?.trim() ? input.note.trim() : null,
      status: enqueue ? "queued" : "draft",
      serverReportId: null,
      serverStatus: null,
      createdAt: clock.nowIso(),
    };

    await this.sql.transaction(async (tx) => {
      await tx.insertReport(reportRow);
      for (const row of attachmentRows) await tx.insertAttachment(row);
      if (enqueue) await this.enqueueCommands(tx, clientReportId, attachmentRows);
    });
    this.emit();
    return clientReportId;
  }

  private async enqueueCommands(
    tx: Parameters<Parameters<SqlAdapter["transaction"]>[0]>[0],
    clientReportId: string,
    attachments: readonly LocalAttachmentRow[],
  ): Promise<void> {
    await tx.insertCommand({ kind: "create_manifest", clientReportId, clientAttachmentId: null });
    for (const attachment of attachments) {
      await tx.insertCommand({
        kind: "upload_attachment",
        clientReportId,
        clientAttachmentId: attachment.clientAttachmentId,
      });
    }
    await tx.insertCommand({ kind: "finalize", clientReportId, clientAttachmentId: null });
  }

  // ------------------------------------------------------------------- drain

  /**
   * Drains sync_commands in seq order. Safe to call from anywhere at any time
   * (app start, connectivity regained, after submit); concurrent calls no-op.
   */
  async drain(): Promise<DrainOutcome> {
    if (this.draining) return { kind: "already-draining" };
    if (this.authRequired) return { kind: "auth-required" };
    this.draining = true;
    try {
      let processed = 0;
      for (;;) {
        const command = await this.sql.nextRunnableCommand();
        if (!command) {
          return processed > 0 ? { kind: "drained", processed } : { kind: "idle" };
        }
        const outcome = await this.runWithRetry(command);
        if (outcome === "done") {
          processed += 1;
          continue;
        }
        if (outcome === "failed") continue; // report blocked; other reports proceed
        if (outcome === "auth") return { kind: "auth-required" };
        return { kind: "backoff", seq: command.seq, attempts: command.attempts };
      }
    } finally {
      this.draining = false;
      this.emit();
    }
  }

  /** Call after the user signed in again; unpauses and re-drains. */
  async resumeAfterAuth(): Promise<DrainOutcome> {
    this.authRequired = false;
    this.emit();
    return this.drain();
  }

  /** Re-queues a report whose command failed permanently (user-initiated retry). */
  async retryReport(clientReportId: string): Promise<void> {
    const commands = await this.sql.listCommands(clientReportId);
    await this.sql.transaction(async (tx) => {
      for (const command of commands) {
        if (command.state === "failed") {
          await tx.updateCommand(command.seq, { state: "pending", attempts: 0, lastError: null });
        }
      }
      await tx.updateReport(clientReportId, { status: "queued" });
    });
    this.emit();
  }

  private async runWithRetry(
    command: SyncCommandRow,
  ): Promise<"done" | "failed" | "auth" | "backoff"> {
    const maxAttempts = this.deps.config.maxAttemptsPerDrain ?? DEFAULT_MAX_ATTEMPTS_PER_DRAIN;
    let attemptsThisDrain = 0;
    for (;;) {
      try {
        await this.executeCommand(command);
        return "done";
      } catch (error) {
        if (error instanceof AuthRequiredError) {
          this.authRequired = true;
          await this.sql.updateCommand(command.seq, { lastError: error.message });
          this.emit();
          return "auth";
        }
        if (error instanceof PermanentCommandError) {
          await this.sql.transaction(async (tx) => {
            await tx.updateCommand(command.seq, { state: "failed", lastError: error.message });
            await tx.updateReport(command.clientReportId, { status: "failed" });
          });
          this.emit();
          return "failed";
        }
        // Retryable: transport error, 5xx, 408/409/429, or a malformed body.
        const message = error instanceof Error ? error.message : String(error);
        attemptsThisDrain += 1;
        command.attempts += 1;
        await this.sql.updateCommand(command.seq, {
          attempts: command.attempts,
          lastError: message,
        });
        this.emit();
        if (attemptsThisDrain >= maxAttempts) return "backoff";
        await this.deps.clock.sleep(this.backoffMs(command.attempts));
      }
    }
  }

  private backoffMs(attempts: number): number {
    const base = this.deps.config.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    const cap = this.deps.config.backoffCapMs ?? DEFAULT_BACKOFF_CAP_MS;
    return Math.min(cap, base * 2 ** Math.max(0, attempts - 1));
  }

  // ------------------------------------------------------------ command exec

  private async executeCommand(command: SyncCommandRow): Promise<void> {
    switch (command.kind) {
      case "create_manifest":
        return this.executeManifest(command);
      case "upload_attachment":
        return this.executeUpload(command);
      case "finalize":
        return this.executeFinalize(command);
      default: {
        const never: never = command.kind;
        throw new PermanentCommandError(`Unknown command kind: ${String(never)}`);
      }
    }
  }

  private async token(): Promise<string> {
    const token = await this.deps.auth.getToken();
    if (!token) throw new AuthRequiredError("Signed out");
    return token;
  }

  private jsonHeaders(token: string, idempotencyKey: string): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": idempotencyKey,
    };
  }

  /** Maps an HTTP response to success or a typed command error. */
  private ensureOk(response: HttpResponse): void {
    const { status } = response;
    if (status >= 200 && status < 300) return;
    const problem = describeProblem(status, response.bodyText);
    if (status === 401) throw new AuthRequiredError(problem);
    // 408/429 are transient by definition; 409 from finalize means uploads are
    // still settling on the server — replaying in order resolves it.
    if (status >= 500 || status === 408 || status === 409 || status === 429) {
      throw new RetryableCommandError(problem);
    }
    throw new PermanentCommandError(problem);
  }

  private async executeManifest(command: SyncCommandRow): Promise<void> {
    const report = await this.sql.getReport(command.clientReportId);
    if (!report) throw new PermanentCommandError("Local report record is missing");
    const attachments = await this.sql.listAttachments(command.clientReportId);

    const payload: CreateReportRequest = {
      clientReportId: report.clientReportId,
      projectId: report.projectId,
      reportDate: report.reportDate,
      ...(report.note === null ? {} : { note: report.note }),
      attachments: attachments.map((attachment) => ({
        clientAttachmentId: attachment.clientAttachmentId,
        kind: attachment.kind,
        contentType: attachment.contentType,
        byteSize: attachment.byteSize,
        checksum: attachment.checksum,
        ...(attachment.capturedAt === null ? {} : { capturedAt: attachment.capturedAt }),
      })),
    };
    // Central schema parse before any bytes leave the device.
    createReportRequest.parse(payload);

    const response = await this.deps.http.request({
      method: "POST",
      url: `${this.deps.config.apiBaseUrl}${apiPaths.reports}`,
      headers: this.jsonHeaders(await this.token(), `create_manifest:${report.clientReportId}`),
      body: JSON.stringify(payload),
    });
    this.ensureOk(response);
    const parsed = createReportResponse.parse(parseJson(response.bodyText));

    // Persist server identifiers, upload URLs, and command completion together
    // so a crash at any point simply replays the idempotent manifest upsert.
    await this.sql.transaction(async (tx) => {
      await tx.updateReport(report.clientReportId, {
        serverReportId: parsed.reportId,
        serverStatus: parsed.status,
        status: "syncing",
      });
      for (const attachment of parsed.attachments) {
        await tx.updateAttachment(attachment.clientAttachmentId, {
          serverAttachmentId: attachment.attachmentId,
          uploadUrl: attachment.uploadUrl,
          ...(attachment.uploaded ? { uploaded: 1 as const } : {}),
        });
      }
      await tx.updateCommand(command.seq, { state: "done", lastError: null });
    });
  }

  private async executeUpload(command: SyncCommandRow): Promise<void> {
    if (!command.clientAttachmentId) {
      throw new PermanentCommandError("Upload command without attachment id");
    }
    const attachment = await this.sql.getAttachment(command.clientAttachmentId);
    if (!attachment) throw new PermanentCommandError("Local attachment record is missing");

    if (!attachment.uploaded) {
      if (!attachment.uploadUrl) {
        // Manifest must have run first; ordered replay will restore this.
        throw new RetryableCommandError("Upload URL not yet known; manifest must complete first");
      }
      const bytes = await this.deps.file.read(attachment.fileUri);
      const response = await this.deps.http.request({
        method: "PUT",
        url: attachment.uploadUrl,
        headers: {
          "content-type": attachment.contentType,
          authorization: `Bearer ${await this.token()}`,
          "idempotency-key": `upload_attachment:${attachment.clientAttachmentId}`,
        },
        body: bytes,
      });
      this.ensureOk(response);
      uploadResponse.parse(parseJson(response.bodyText));
    }

    await this.sql.transaction(async (tx) => {
      await tx.updateAttachment(command.clientAttachmentId as string, { uploaded: 1 });
      await tx.updateCommand(command.seq, { state: "done", lastError: null });
    });
  }

  private async executeFinalize(command: SyncCommandRow): Promise<void> {
    const report = await this.sql.getReport(command.clientReportId);
    if (!report) throw new PermanentCommandError("Local report record is missing");
    if (!report.serverReportId) {
      throw new RetryableCommandError("Server report id not yet known; manifest must complete first");
    }

    const response = await this.deps.http.request({
      method: "POST",
      url: `${this.deps.config.apiBaseUrl}${apiPaths.finalize(report.serverReportId)}`,
      headers: this.jsonHeaders(await this.token(), `finalize:${report.clientReportId}`),
      body: JSON.stringify({}),
    });
    this.ensureOk(response);
    const parsed = finalizeReportResponse.parse(parseJson(response.bodyText));

    await this.sql.transaction(async (tx) => {
      await tx.updateReport(report.clientReportId, {
        status: "synced",
        serverStatus: parsed.status,
      });
      await tx.updateCommand(command.seq, { state: "done", lastError: null });
    });
  }

  // ----------------------------------------------------------------- queries

  async getSummary(): Promise<SyncSummary> {
    const [reports, commands, pendingCommands] = await Promise.all([
      this.sql.listReports(),
      this.sql.listCommands(),
      this.sql.countPendingCommands(),
    ]);
    const summaries: DraftSummary[] = [];
    for (const report of reports) {
      const attachments = await this.sql.listAttachments(report.clientReportId);
      const failed = commands.find(
        (c) => c.clientReportId === report.clientReportId && c.state === "failed",
      );
      summaries.push({
        clientReportId: report.clientReportId,
        projectId: report.projectId,
        reportDate: report.reportDate,
        note: report.note,
        status: report.status,
        serverReportId: report.serverReportId,
        serverStatus: report.serverStatus,
        createdAt: report.createdAt,
        totalFiles: attachments.length,
        uploadedFiles: attachments.filter((a) => a.uploaded === 1).length,
        lastError: failed?.lastError ?? null,
      });
    }
    summaries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { pendingCommands, authRequired: this.authRequired, reports: summaries };
  }

  /**
   * "Danger: clear synced local data" — deletes only reports whose finalize
   * command completed, together with their on-device files. Server data and
   * unsynced work are untouched.
   */
  async clearSyncedData(): Promise<{ deletedReports: number }> {
    const reports = await this.sql.listReports();
    let deleted = 0;
    for (const report of reports) {
      if (report.status !== "synced") continue;
      const commands = await this.sql.listCommands(report.clientReportId);
      if (commands.some((c) => c.state !== "done")) continue;
      const attachments = await this.sql.listAttachments(report.clientReportId);
      for (const attachment of attachments) {
        await this.deps.file.delete(attachment.fileUri);
      }
      await this.sql.transaction(async (tx) => {
        await tx.deleteReportCascade(report.clientReportId);
      });
      deleted += 1;
    }
    if (deleted > 0) this.emit();
    return { deletedReports: deleted };
  }
}

export type { SyncEngineDeps } from "./adapters";
