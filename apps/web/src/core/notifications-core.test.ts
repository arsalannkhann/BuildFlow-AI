import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createTestDb } from "@buildflow/db/client";
import { seed, SEED } from "@buildflow/db/seed";
import { resolveTenantContext } from "@buildflow/auth/context";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { listDeliveriesFor, listMyNotifications } from "@buildflow/db/queries/notifications";
import { notifyEvent, NOTIFICATION_DELIVER_JOB } from "@buildflow/notify/emit";
import { deliverNotification } from "@buildflow/notify/deliver";
import { LocalFsWhatsApp, emailOutboxDir, whatsappOutboxDir } from "@buildflow/notify/local-fs";
import type { JobRegistry } from "@buildflow/jobs/types";
import { drainJobs } from "@buildflow/jobs/runner";
import { finalizeReport, storeAttachmentContent, upsertReportManifest } from "./sync-core";
import { requestChanges } from "@/app/actions/review-core";
import {
  emitEvent, markAllRead, markRead, myNotifications, myPreferenceMatrix, myUnreadCount,
  setMyPreference,
} from "./notifications-core";

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

async function setup() {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-notif-"));
  const db = await createTestDb();
  await seed(db);
  const eng = await resolveTenantContext(db, SEED.engineer.id, SEED.projectId);
  const mgr = await resolveTenantContext(db, SEED.manager.id, SEED.projectId);
  const owner = await resolveTenantContext(db, SEED.owner.id, SEED.projectId);
  const storage = new LocalFsStorage(process.env.STORAGE_DIR);
  return { db, eng, mgr, owner, storage };
}

async function syncOneReport(db: Awaited<ReturnType<typeof createTestDb>>, ctx: any, storage: LocalFsStorage, clientReportId: string) {
  const audio = new TextEncoder().encode(`audio-${clientReportId}`);
  const manifest = await upsertReportManifest(db, ctx, {
    clientReportId, projectId: SEED.projectId, reportDate: "2026-07-19",
    attachments: [{ clientAttachmentId: "a1", kind: "audio" as const, contentType: "audio/webm",
      byteSize: audio.byteLength, checksum: sha256(audio) }],
  });
  await storeAttachmentContent(db, storage, ctx, manifest.reportId, manifest.attachments[0].attachmentId, audio);
  const done = await finalizeReport(db, ctx, manifest.reportId);
  expect(done.status).toBe("AWAITING_REVIEW");
  return manifest.reportId;
}

test("awaiting-review notifications reach reviewers only, with email delivered to the outbox", async () => {
  const { db, eng, mgr, owner, storage } = await setup();
  const reportId = await syncOneReport(db, eng, storage, "dev-r1");

  // Manager and owner hold report.review -> notified. The engineer submitted the report
  // (actor), so he is never re-notified about his own submission.
  const mgrRows = await myNotifications(db, mgr);
  expect(mgrRows).toHaveLength(1);
  expect(mgrRows[0].eventKind).toBe("report.awaiting_review");
  expect(mgrRows[0].subjectRef).toBe(reportId);
  expect(mgrRows[0].title).toContain("2026-07-19");
  expect(mgrRows[0].title).not.toMatch(/cement|labour|blocker/i); // record ref only, no content
  expect(await myNotifications(db, eng)).toHaveLength(0);
  expect((await myNotifications(db, owner))[0]?.eventKind).toBe("report.awaiting_review");

  // Email is a default-on channel for review requests: deliveries sent, .eml files exist.
  const deliveries = mgrRows[0].deliveries;
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0].channel).toBe("email");
  expect(deliveries[0].status).toBe("sent");
  expect(deliveries[0].providerMessageId).toBeTruthy();
  const emlFiles = readdirSync(emailOutboxDir());
  expect(emlFiles.length).toBeGreaterThanOrEqual(2); // manager + owner
  expect(existsSync(whatsappOutboxDir())).toBe(false); // whatsapp default off

  // Unread bookkeeping.
  expect(await myUnreadCount(db, mgr)).toBe(1);
  await markRead(db, mgr, mgrRows[0].id);
  expect(await myUnreadCount(db, mgr)).toBe(0);
});

test("rejection notifies report creators (not the acting reviewer); preferences flip channels", async () => {
  const { db, eng, mgr, owner, storage } = await setup();
  const reportId = await syncOneReport(db, eng, storage, "dev-r2");

  await requestChanges(db, mgr, reportId, "quantities unclear");
  const engRows = await myNotifications(db, eng);
  expect(engRows).toHaveLength(1);
  expect(engRows[0].eventKind).toBe("report.rejected");
  expect(engRows[0].body ?? "").not.toContain("quantities unclear"); // reason never leaves the review trail
  expect((await myNotifications(db, mgr)).filter((n) => n.eventKind === "report.rejected")).toHaveLength(0);

  // Owner turns email off and WhatsApp on for awaiting-review, then a new report arrives.
  await setMyPreference(db, owner, { eventKind: "report.awaiting_review", channel: "email", enabled: false });
  await setMyPreference(db, owner, { eventKind: "report.awaiting_review", channel: "whatsapp", enabled: true });
  const matrix = await myPreferenceMatrix(db, owner);
  const row = matrix.find((r) => r.eventKind === "report.awaiting_review")!;
  expect(row.channels).toEqual({ inapp: true, email: false, whatsapp: true });

  await syncOneReport(db, eng, storage, "dev-r3");
  const ownerRows = (await myNotifications(db, owner)).filter((n) => n.eventKind === "report.awaiting_review");
  const latest = ownerRows[0];
  expect(latest.deliveries.map((d) => d.channel)).toEqual(["whatsapp"]);
  expect(latest.deliveries[0].status).toBe("sent");
  expect(readdirSync(whatsappOutboxDir()).length).toBe(1);

  await markAllRead(db, eng);
  expect(await myUnreadCount(db, eng)).toBe(0);
});

test("capability-mapped events: blocker to blocker.manage holders; shortage to material.manage", async () => {
  const { db, eng, mgr } = await setup();
  const { raiseBlocker } = await import("./controls-core");
  const blockerId = await raiseBlocker(db, mgr, {
    projectId: SEED.projectId, title: "Crane breakdown", severity: "critical",
  });
  // Engineer holds blocker.manage -> notified; the acting manager is not.
  const engRows = await myNotifications(db, eng);
  expect(engRows.some((n) => n.eventKind === "blocker.raised" && n.subjectRef === blockerId)).toBe(true);
  expect((await myNotifications(db, mgr)).some((n) => n.eventKind === "blocker.raised")).toBe(false);

  const { createMaterial, recordStockMovement } = await import("./materials-core");
  const materialId = await createMaterial(db, eng, { name: "Cement", unit: "bag", reorderThreshold: "100" });
  await recordStockMovement(db, eng, { projectId: SEED.projectId, materialId, kind: "received", quantity: "120" });
  await recordStockMovement(db, eng, { projectId: SEED.projectId, materialId, kind: "issued", quantity: "50" });
  // 70 < 100 -> shortage. material.manage holders: owner + engineer; engineer acted.
  const { owner } = { owner: await resolveTenantContext(db, SEED.owner.id, SEED.projectId) };
  const shortage = (await myNotifications(db, owner)).find((n) => n.eventKind === "material.shortage");
  expect(shortage).toBeTruthy();
  expect(shortage!.title).toContain("Cement");
  expect((await myNotifications(db, eng)).some((n) => n.eventKind === "material.shortage")).toBe(false);
  // Capability scoping: the manager holds material.review but NOT material.manage, so a
  // shortage event never reaches them.
  expect((await myNotifications(db, mgr)).some((n) => n.eventKind === "material.shortage")).toBe(false);
});

test("failing email adapter: delivery retries with visible status, then dead-letters", async () => {
  const { db, eng } = await setup();
  const failingRegistry = {
    email: {
      provider: "failing",
      send: async () => { throw new Error("SMTP connection refused"); },
    },
    whatsapp: new LocalFsWhatsApp(),
  };
  const registry: JobRegistry = {
    [NOTIFICATION_DELIVER_JOB]: (db2, payload, meta) =>
      deliverNotification(db2, payload, meta, failingRegistry),
  };

  // Emit without draining, then drive the queue with the failing adapter.
  await notifyEvent(db, eng, {
    eventKind: "report.awaiting_review", subjectRef: "r-x", projectId: SEED.projectId,
    title: "DPR 2026-07-19 is ready for review",
  });
  const mgr = await resolveTenantContext(db, SEED.manager.id, SEED.projectId);
  const [notif] = await listMyNotifications(db, mgr);
  expect(notif).toBeTruthy();

  await drainJobs(db, registry);
  let [delivery] = await listDeliveriesFor(db, mgr, [notif.id]);
  expect(delivery.status).toBe("failed"); // "failed — will retry" in the UI
  expect(delivery.attempts).toBe(1);
  expect(delivery.lastError).toMatch(/SMTP connection refused/);

  // Fast-forward the backoff and drain until the queue dead-letters the job.
  for (let i = 0; i < 6; i += 1) {
    await db.execute(sql`update "job" set run_after = now() where kind = ${NOTIFICATION_DELIVER_JOB}`);
    await drainJobs(db, registry);
  }
  [delivery] = await listDeliveriesFor(db, mgr, [notif.id]);
  expect(delivery.status).toBe("dead"); // "could not be delivered" in the UI
  expect(delivery.attempts).toBeGreaterThanOrEqual(5);
  const deadJobs = await db.execute(sql`
    select status from "job" where kind = ${NOTIFICATION_DELIVER_JOB}`);
  const statuses = (deadJobs as unknown as { rows: { status: string }[] }).rows.map((r) => r.status);
  expect(statuses.every((s) => s === "dead")).toBe(true); // visible on the portfolio reliability tile

  // A later emission with a working adapter still succeeds (dead letters do not wedge the queue).
  await emitEvent(db, eng, {
    eventKind: "report.awaiting_review", subjectRef: "r-y", projectId: SEED.projectId,
    title: "DPR 2026-07-20 is ready for review",
  });
  const rows = await myNotifications(db, mgr);
  const fresh = rows.find((n) => n.subjectRef === "r-y")!;
  expect(fresh.deliveries[0].status).toBe("sent");
});
