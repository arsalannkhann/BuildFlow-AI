import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { cmpDecimal } from "@buildflow/domain/decimal";
import {
  listDeliveriesFor, listMyNotifications, listPreferences, markAllNotificationsRead,
  markNotificationRead, unreadNotificationCount, upsertPreference,
  type NotificationDeliveryRow, type NotificationRow,
} from "@buildflow/db/queries/notifications";
import { getMaterial, stockLevels } from "@buildflow/db/queries/materials";
import { audit } from "@buildflow/db/queries/audit";
import { notifyEvent, type NotifyInput } from "@buildflow/notify/emit";
import {
  NOTIFICATION_EVENTS, NOTIFICATION_EVENT_KINDS, NOTIFY_CHANNELS, defaultEnabled,
  type NotificationEventKind, type NotifyChannel,
} from "@buildflow/notify/catalog";
import { drainJobs } from "@buildflow/jobs/runner";
import { pipelineJobRegistry } from "@buildflow/pipeline/jobs";

const inlineJobs = () => (process.env.JOBS_MODE ?? "inline") !== "worker";

/**
 * The single emission entry point for web cores (Phase E1 hooks call exactly this).
 * Writes in-app rows synchronously; in inline-jobs mode also drains the queue so the
 * enqueued email/WhatsApp deliveries go out before the request returns. Call it AFTER
 * the domain transaction has committed.
 */
export async function emitEvent(db: AppDb, ctx: TenantContext, input: NotifyInput): Promise<void> {
  await notifyEvent(db, ctx, input);
  if (inlineJobs()) await drainJobs(db, pipelineJobRegistry);
}

/**
 * Deterministic shortage check for one material after a stock movement: ledger sum vs
 * reorder threshold, no prediction. Emits `material.shortage` when below.
 */
export async function emitShortageIfBelow(
  db: AppDb, ctx: TenantContext, projectId: string, materialId: string,
): Promise<void> {
  const material = await getMaterial(db, ctx, materialId);
  if (!material?.isActive || material.reorderThreshold == null) return;
  const level = (await stockLevels(db, ctx, projectId))
    .find((l) => l.materialId === materialId)?.currentStock ?? "0";
  if (cmpDecimal(level, material.reorderThreshold) >= 0) return;
  await emitEvent(db, ctx, {
    eventKind: "material.shortage", subjectRef: materialId, projectId,
    title: `Low stock: ${material.name}`,
    body: `${level} ${material.unit} on hand, reorder threshold ${material.reorderThreshold} ${material.unit}`,
  });
}

// --- reading + preferences (recipient-scoped; any signed-in member) ---

export type NotificationWithDeliveries = NotificationRow & { deliveries: NotificationDeliveryRow[] };

export async function myNotifications(
  db: AppDb, ctx: TenantContext, opts?: { limit?: number },
): Promise<NotificationWithDeliveries[]> {
  const rows = await listMyNotifications(db, ctx, opts);
  const deliveries = await listDeliveriesFor(db, ctx, rows.map((r) => r.id));
  return rows.map((row) => ({
    ...row, deliveries: deliveries.filter((d) => d.notificationId === row.id),
  }));
}

export const myUnreadCount = (db: AppDb, ctx: TenantContext): Promise<number> =>
  unreadNotificationCount(db, ctx);

export async function markRead(db: AppDb, ctx: TenantContext, notificationId: string): Promise<void> {
  await markNotificationRead(db, ctx, notificationId);
}

export async function markAllRead(db: AppDb, ctx: TenantContext): Promise<void> {
  await markAllNotificationsRead(db, ctx);
}

export type PreferenceMatrixRow = {
  eventKind: NotificationEventKind;
  label: string;
  channels: Record<NotifyChannel, boolean>;
};

/** The signed-in user's effective preference matrix (stored rows over catalog defaults). */
export async function myPreferenceMatrix(db: AppDb, ctx: TenantContext): Promise<PreferenceMatrixRow[]> {
  const stored = await listPreferences(db, ctx, [ctx.userId]);
  return NOTIFICATION_EVENT_KINDS.map((eventKind) => ({
    eventKind,
    label: NOTIFICATION_EVENTS[eventKind].label,
    channels: Object.fromEntries(NOTIFY_CHANNELS.map((channel) => {
      const row = stored.find((p) => p.eventKind === eventKind && p.channel === channel);
      return [channel, row ? row.enabled : defaultEnabled(eventKind, channel)];
    })) as Record<NotifyChannel, boolean>,
  }));
}

export async function setMyPreference(db: AppDb, ctx: TenantContext, input: {
  eventKind: string; channel: string; enabled: boolean;
}): Promise<void> {
  if (!(NOTIFICATION_EVENT_KINDS as string[]).includes(input.eventKind)) {
    throw new Error(`Unknown notification event: ${input.eventKind}`);
  }
  if (!(NOTIFY_CHANNELS as readonly string[]).includes(input.channel)) {
    throw new Error(`Unknown channel: ${input.channel}`);
  }
  await upsertPreference(db, ctx, { userId: ctx.userId, ...input });
  await audit(db, ctx, {
    action: "notification.preference_set", subjectRef: ctx.userId,
    metadata: { eventKind: input.eventKind, channel: input.channel, enabled: input.enabled },
  });
}

/** Where a notification's subject lives in the app (every row links to its records). */
export function notificationHref(n: NotificationRow): string {
  const p = n.projectId;
  switch (n.eventKind as NotificationEventKind) {
    case "report.awaiting_review":
    case "report.rejected":
    case "report.approved":
    case "report.processing_failed":
      return `/reports/${n.subjectRef}`;
    case "report.missing":
      return p ? `/projects/${p}` : "/reports";
    case "blocker.raised":
    case "blocker.overdue":
      return p ? `/projects/${p}/blockers` : "/projects";
    case "material.shortage":
      return p ? `/projects/${p}/materials/${n.subjectRef}` : "/projects";
    case "rfq.quote_requested":
      return p ? `/projects/${p}/procurement/rfqs/${n.subjectRef}` : "/projects";
    case "po.awaiting_approval":
      return p ? `/projects/${p}/procurement/pos/${n.subjectRef}` : "/projects";
    case "invoice.awaiting_review":
      return p ? `/projects/${p}/budget/invoices/${n.subjectRef}` : "/projects";
    case "mb.awaiting_verification":
      return p ? `/projects/${p}/mb/${n.subjectRef}` : "/projects";
    case "compliance.due_soon":
      return p ? `/projects/${p}/compliance` : "/projects";
    default:
      return "/notifications";
  }
}
