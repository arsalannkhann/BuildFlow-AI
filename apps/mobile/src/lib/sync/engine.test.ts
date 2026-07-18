// Offline sync engine tests — pure node, in-memory fake adapters only.
// Never import react-native or expo modules here (root vitest runs this file).

import { describe, expect, it } from "vitest";
import { SyncEngine } from "./engine";
import { HttpTransportError, type HttpAdapter, type HttpRequest, type HttpResponse, type SyncEngineDeps } from "./adapters";
import { FakeAuth, FakeClock, FakeCrypto, FakeFiles, FakeServer, FakeSql } from "./fakes";
import type { CaptureInput } from "./types";

const AUDIO = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const PHOTO_A = new Uint8Array([10, 20, 30, 40]);
const PHOTO_B = new Uint8Array([50, 60, 70, 80, 90]);

/** Injects transport failures for exact request indexes (1-based). */
class ScriptedHttp implements HttpAdapter {
  private index = 0;
  readonly networkFailOn = new Set<number>();

  constructor(private readonly inner: HttpAdapter) {}

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.index += 1;
    if (this.networkFailOn.has(this.index)) {
      throw new HttpTransportError("Network request failed");
    }
    return this.inner.request(request);
  }
}

interface Harness {
  engine: SyncEngine;
  sql: FakeSql;
  files: FakeFiles;
  server: FakeServer;
  http: ScriptedHttp;
  clock: FakeClock;
  crypto: FakeCrypto;
  auth: FakeAuth;
  deps: SyncEngineDeps;
}

async function makeHarness(): Promise<Harness> {
  const crypto = new FakeCrypto();
  const sql = new FakeSql();
  const files = new FakeFiles();
  const server = new FakeServer(crypto);
  const http = new ScriptedHttp(server.http());
  const clock = new FakeClock();
  const auth = new FakeAuth();
  const deps: SyncEngineDeps = {
    sql,
    file: files,
    http,
    clock,
    crypto,
    auth,
    config: { apiBaseUrl: server.baseUrl, maxAttemptsPerDrain: 2, backoffBaseMs: 10 },
  };
  files.put("file:///captures/audio.m4a", AUDIO);
  files.put("file:///captures/photo-a.jpg", PHOTO_A);
  files.put("file:///captures/photo-b.jpg", PHOTO_B);
  const engine = new SyncEngine(deps);
  await engine.init();
  return { engine, sql, files, server, http, clock, crypto, auth, deps };
}

const CAPTURE: CaptureInput = {
  projectId: "project-1",
  reportDate: "2026-07-19",
  note: "Slab poured on block B",
  attachments: [
    { kind: "audio", fileUri: "file:///captures/audio.m4a", contentType: "audio/mp4" },
    {
      kind: "photo",
      fileUri: "file:///captures/photo-a.jpg",
      contentType: "image/jpeg",
      capturedAt: "2026-07-19T10:15:00+05:30",
    },
    { kind: "photo", fileUri: "file:///captures/photo-b.jpg", contentType: "image/jpeg" },
  ],
};

const manifestPosts = (server: FakeServer) =>
  server.requests.filter((r) => r.method === "POST" && !r.url.includes("finalize"));

describe("submit + ordered drain (scenario a)", () => {
  it("submit is a durable local save before any network work", async () => {
    const h = await makeHarness();
    const { clientReportId } = await h.engine.submitCapture(CAPTURE);

    expect(h.server.requests).toHaveLength(0); // ack came from the local commit
    expect((await h.sql.getReport(clientReportId))?.status).toBe("queued");
    expect(await h.sql.listAttachments(clientReportId)).toHaveLength(3);
    const commands = await h.sql.listCommands(clientReportId);
    expect(commands.map((c) => c.kind)).toEqual([
      "create_manifest",
      "upload_attachment",
      "upload_attachment",
      "upload_attachment",
      "finalize",
    ]);
    expect(commands.every((c) => c.state === "pending")).toBe(true);
  });

  it("drains the queue in seq order until synced", async () => {
    const h = await makeHarness();
    const { clientReportId } = await h.engine.submitCapture(CAPTURE);

    const outcome = await h.engine.drain();
    expect(outcome).toEqual({ kind: "drained", processed: 5 });
    expect(h.server.requests.map((r) => r.method)).toEqual(["POST", "PUT", "PUT", "PUT", "POST"]);

    const report = await h.sql.getReport(clientReportId);
    expect(report?.status).toBe("synced");
    expect(report?.serverReportId).toBe("srv-report-1");
    expect(report?.serverStatus).toBe("PROCESSING");
    expect((await h.sql.listCommands(clientReportId)).every((c) => c.state === "done")).toBe(true);

    const serverReport = h.server.reports.get(clientReportId);
    expect(serverReport?.status).toBe("PROCESSING");
    expect(serverReport?.attachments).toHaveLength(3);
    expect(serverReport?.attachments.every((a) => a.uploaded)).toBe(true);
    expect(serverReport?.attachments.find((a) => a.kind === "audio")?.bytes).toEqual(AUDIO);

    // Re-draining is a no-op: nothing pending, no extra requests.
    expect(await h.engine.drain()).toEqual({ kind: "idle" });
    expect(h.server.requests).toHaveLength(5);
  });
});

describe("network failure mid-queue (scenario b)", () => {
  it("parks on the failing command with backoff, then resumes it without divergent payloads", async () => {
    const h = await makeHarness();
    const { clientReportId } = await h.engine.submitCapture(CAPTURE);

    // Requests: 1=manifest, 2=upload#1, 3=upload#1 retry. Kill 2 and 3 —
    // maxAttemptsPerDrain=2 parks the drain mid-queue on upload#1.
    h.http.networkFailOn.add(2).add(3);
    const outcome1 = await h.engine.drain();
    expect(outcome1.kind).toBe("backoff");
    expect(h.clock.sleeps).toEqual([10]); // exponential backoff between attempts

    const commands = await h.sql.listCommands(clientReportId);
    expect(commands[0]?.state).toBe("done"); // manifest completed
    expect(commands[1]?.state).toBe("pending"); // upload #1 parked, never skipped
    expect(commands[1]?.attempts).toBe(2);
    expect(commands[1]?.lastError).toContain("Network request failed");
    expect(commands[2]?.state).toBe("pending");
    expect(commands[3]?.state).toBe("pending");
    expect(commands[4]?.state).toBe("pending");

    // Network restored: the next drain resumes at the SAME command.
    const outcome2 = await h.engine.drain();
    expect(outcome2).toEqual({ kind: "drained", processed: 4 }); // 3 uploads + finalize

    // No duplicate server calls with different payloads:
    expect(manifestPosts(h.server)).toHaveLength(1); // manifest sent exactly once
    const audioPuts = h.server.requests.filter(
      (r) => r.method === "PUT" && r.url === h.server.requests[1]?.url,
    );
    expect(audioPuts.length).toBe(1); // failed attempts never reached the server
    expect(h.server.reports.size).toBe(1);
    expect((await h.sql.getReport(clientReportId))?.status).toBe("synced");
  });

  it("retries a manifest that never reached the server with a byte-identical payload", async () => {
    const h = await makeHarness();
    const { clientReportId } = await h.engine.submitCapture(CAPTURE);

    h.http.networkFailOn.add(1).add(2); // both manifest attempts of drain #1
    expect((await h.engine.drain()).kind).toBe("backoff");
    expect(h.server.reports.size).toBe(0); // nothing reached the server
    expect((await h.sql.listCommands(clientReportId))[0]).toMatchObject({
      kind: "create_manifest",
      state: "pending",
      attempts: 2,
    });

    expect(await h.engine.drain()).toEqual({ kind: "drained", processed: 5 });
    const bodies = manifestPosts(h.server).map((r) => r.bodyText);
    expect(bodies).toHaveLength(1); // earlier attempts died on the wire
    expect(h.server.reports.size).toBe(1);
    expect((await h.sql.getReport(clientReportId))?.status).toBe("synced");
  });
});

describe("restart mid-queue (scenario c)", () => {
  it("a new engine over the same SQL state resumes exactly where it stopped", async () => {
    const h = await makeHarness();
    const { clientReportId } = await h.engine.submitCapture(CAPTURE);

    // Worst case for duplication: the server stores upload #1 but the response
    // is lost, then the network dies for the in-drain retry. Request order:
    // 1=manifest (ok), 2=upload#1 (processed, response dropped), 3=retry (network).
    const inner = h.server.http();
    let index = 0;
    h.deps.http = {
      request: async (request) => {
        index += 1;
        if (index === 2) h.server.planFailures({ kind: "drop-response" });
        if (index === 3) throw new HttpTransportError("Network request failed");
        return inner.request(request);
      },
    };
    expect((await h.engine.drain()).kind).toBe("backoff");

    // Server already holds the bytes; local command is still pending.
    const serverAudio = h.server.reports.get(clientReportId)?.attachments[0];
    expect(serverAudio?.uploaded).toBe(true);
    const commandsMid = await h.sql.listCommands(clientReportId);
    expect(commandsMid[1]?.state).toBe("pending");

    // "Process death": brand-new engine instance over the same persisted state.
    const engine2 = new SyncEngine({ ...h.deps, http: h.server.http() });
    await engine2.init();
    const outcome2 = await engine2.drain();
    expect(outcome2).toEqual({ kind: "drained", processed: 4 });

    expect((await h.sql.getReport(clientReportId))?.status).toBe("synced");
    const serverReport = h.server.reports.get(clientReportId);
    expect(serverReport?.status).toBe("PROCESSING");
    expect(serverReport?.attachments).toHaveLength(3); // replay created no duplicates
    expect(serverReport?.attachments.every((a) => a.uploaded)).toBe(true);
    expect(h.server.reports.size).toBe(1);
  });
});

describe("401 handling (scenario d)", () => {
  it("pauses the queue on 401 and resumes fully after re-auth", async () => {
    const h = await makeHarness();
    await h.engine.submitCapture(CAPTURE);

    h.auth.token = "expired-token"; // server only accepts token-1
    expect(await h.engine.drain()).toEqual({ kind: "auth-required" });
    expect(h.engine.isAuthRequired).toBe(true);

    // Paused: further drains do not touch the network.
    const requestsBefore = h.server.requests.length;
    expect(await h.engine.drain()).toEqual({ kind: "auth-required" });
    expect(h.server.requests.length).toBe(requestsBefore);

    // Queue intact — nothing failed, manifest still pending.
    const summary = await h.engine.getSummary();
    expect(summary.authRequired).toBe(true);
    expect(summary.pendingCommands).toBe(5);
    expect(summary.reports[0]?.status).toBe("queued");

    // User signs in again.
    h.auth.token = "token-1";
    expect(await h.engine.resumeAfterAuth()).toEqual({ kind: "drained", processed: 5 });
    expect(h.engine.isAuthRequired).toBe(false);
    expect((await h.engine.getSummary()).reports[0]?.status).toBe("synced");
  });

  it("a missing token pauses without any network call", async () => {
    const h = await makeHarness();
    await h.engine.submitCapture(CAPTURE);

    h.auth.token = null;
    expect(await h.engine.drain()).toEqual({ kind: "auth-required" });
    expect(h.server.requests).toHaveLength(0);
  });
});

describe("checksum integrity (scenario e)", () => {
  it("the on-device sha256 flows unchanged into manifest and upload verification", async () => {
    const h = await makeHarness();
    const { clientReportId } = await h.engine.submitCapture(CAPTURE);

    const expectedAudioChecksum = await h.crypto.sha256Hex(AUDIO);
    const expectedPhotoAChecksum = await h.crypto.sha256Hex(PHOTO_A);
    expect(expectedAudioChecksum).toHaveLength(64);

    // Stored locally at capture time.
    const attachments = await h.sql.listAttachments(clientReportId);
    const localAudio = attachments.find((a) => a.kind === "audio");
    expect(localAudio?.checksum).toBe(expectedAudioChecksum);
    expect(localAudio?.byteSize).toBe(AUDIO.byteLength);

    await h.engine.drain();

    // Present verbatim in the manifest payload.
    const manifest = JSON.parse(manifestPosts(h.server)[0]?.bodyText ?? "{}") as {
      attachments: { kind: string; checksum: string; capturedAt?: string }[];
    };
    expect(manifest.attachments.find((a) => a.kind === "audio")?.checksum).toBe(
      expectedAudioChecksum,
    );
    expect(manifest.attachments.map((a) => a.checksum)).toContain(expectedPhotoAChecksum);
    // EXIF capturedAt flows through too.
    expect(manifest.attachments.some((a) => a.capturedAt === "2026-07-19T10:15:00+05:30")).toBe(
      true,
    );

    // The server verified the uploaded bytes against that same checksum.
    const serverAudio = h.server.reports
      .get(clientReportId)
      ?.attachments.find((a) => a.kind === "audio");
    expect(serverAudio?.checksum).toBe(expectedAudioChecksum);
    expect(serverAudio?.uploaded).toBe(true);
  });

  it("surfaces a server checksum rejection as a permanent failure", async () => {
    const h = await makeHarness();
    const { clientReportId } = await h.engine.submitCapture(CAPTURE);

    // File corrupted on disk AFTER capture — server must refuse the bytes.
    h.files.put("file:///captures/audio.m4a", new Uint8Array([9, 9, 9]));
    await h.engine.drain();

    const commands = await h.sql.listCommands(clientReportId);
    const failedUpload = commands.find(
      (c) => c.kind === "upload_attachment" && c.state === "failed",
    );
    expect(failedUpload?.lastError).toContain("Checksum mismatch");
    expect((await h.sql.getReport(clientReportId))?.status).toBe("failed");
  });
});

describe("permanent 4xx failures", () => {
  it("marks the command failed with the problem detail and never auto-retries", async () => {
    const h = await makeHarness();
    const { clientReportId } = await h.engine.submitCapture(CAPTURE);

    h.server.planFailures({
      kind: "status",
      status: 422,
      title: "Invalid request",
      detail: "photo exceeds size limit",
    });
    await h.engine.drain();

    const commands = await h.sql.listCommands(clientReportId);
    expect(commands[0]?.state).toBe("failed");
    expect(commands[0]?.lastError).toContain("Invalid request: photo exceeds size limit");
    expect((await h.sql.getReport(clientReportId))?.status).toBe("failed");

    const requestCount = h.server.requests.length;
    expect(await h.engine.drain()).toEqual({ kind: "idle" });
    expect(h.server.requests.length).toBe(requestCount); // no automatic retry
  });

  it("a failed report blocks only itself; later reports still sync; manual retry recovers", async () => {
    const h = await makeHarness();
    const { clientReportId: badId } = await h.engine.submitCapture(CAPTURE);
    const { clientReportId: goodId } = await h.engine.submitCapture(CAPTURE);

    h.server.planFailures({ kind: "status", status: 422, title: "Invalid request" });
    expect((await h.engine.drain()).kind).toBe("drained");

    expect((await h.sql.getReport(badId))?.status).toBe("failed");
    expect((await h.sql.getReport(goodId))?.status).toBe("synced");

    await h.engine.retryReport(badId);
    expect((await h.sql.getReport(badId))?.status).toBe("queued");
    await h.engine.drain();
    expect((await h.sql.getReport(badId))?.status).toBe("synced");
  });
});

describe("drafts and cleanup", () => {
  it("save-and-finish-later creates no commands until submitted", async () => {
    const h = await makeHarness();

    const { clientReportId } = await h.engine.saveDraft(CAPTURE);
    expect((await h.sql.getReport(clientReportId))?.status).toBe("draft");
    expect(await h.sql.countPendingCommands()).toBe(0);
    expect(await h.engine.drain()).toEqual({ kind: "idle" });

    await h.engine.submitDraft(clientReportId);
    expect(await h.sql.countPendingCommands()).toBe(5);
    await h.engine.drain();
    expect((await h.sql.getReport(clientReportId))?.status).toBe("synced");
  });

  it("clearSyncedData removes only fully-synced reports and their files", async () => {
    const h = await makeHarness();

    const { clientReportId: syncedId } = await h.engine.submitCapture(CAPTURE);
    await h.engine.drain();
    const { clientReportId: pendingId } = await h.engine.saveDraft(CAPTURE);

    const { deletedReports } = await h.engine.clearSyncedData();
    expect(deletedReports).toBe(1);
    expect(await h.sql.getReport(syncedId)).toBeNull();
    expect(await h.sql.getReport(pendingId)).not.toBeNull();
    expect((await h.sql.listAttachments(pendingId)).length).toBe(3);
  });

  it("rejects a capture without audio before saving anything", async () => {
    const h = await makeHarness();
    await expect(
      h.engine.submitCapture({
        ...CAPTURE,
        attachments: CAPTURE.attachments.filter((a) => a.kind !== "audio"),
      }),
    ).rejects.toThrow(/audio/i);
    expect(await h.sql.listReports()).toHaveLength(0);
  });
});
