import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import {
  insertDelivery, insertNotification, listPreferences, recipientsWithCapability,
} from "@buildflow/db/queries/notifications";
import { enqueueJob } from "@buildflow/jobs/queue";
import {
  NOTIFICATION_EVENTS, defaultEnabled,
  type NotificationEventKind, type NotifyChannel,
} from "./catalog";

export const NOTIFICATION_DELIVER_JOB = "notification.deliver";

export type NotifyInput = {
  eventKind: NotificationEventKind;
  /** Entity id the event is about (report id, blocker id, PO id, ...). */
  subjectRef: string;
  projectId?: string | null;
  /** Record title / reference only — NEVER report narrative or customer content (rules.md §14). */
  title: string;
  /** Optional operational body (status, severity, counts) — same content rule as title. */
  body?: string | null;
};

/**
 * Emits one catalog event: resolves recipients (project members holding the event's
 * capability, minus the actor), writes in-app notification rows synchronously, and
 * enqueues a `notification.deliver` job per enabled external channel. Callers in inline
 * jobs mode drain the queue afterwards (the web cores' emitEvent wrapper does this);
 * inside the worker/pipeline the running drain loop picks the new jobs up itself.
 */
export async function notifyEvent(db: AppDb, ctx: TenantContext, input: NotifyInput): Promise<void> {
  const spec = NOTIFICATION_EVENTS[input.eventKind];
  if (!spec) throw new Error(`Unknown notification event: ${input.eventKind}`);
  const recipients = (await recipientsWithCapability(db, ctx, {
    projectId: input.projectId ?? null, capability: spec.capability,
  })).filter((r) => r.userId !== ctx.userId); // the actor already knows
  if (recipients.length === 0) return;

  const prefs = await listPreferences(db, ctx, recipients.map((r) => r.userId));
  const enabledFor = (userId: string, channel: NotifyChannel): boolean => {
    const row = prefs.find((p) =>
      p.userId === userId && p.eventKind === input.eventKind && p.channel === channel);
    return row ? row.enabled : defaultEnabled(input.eventKind, channel);
  };

  for (const recipient of recipients) {
    const channels = {
      inapp: enabledFor(recipient.userId, "inapp"),
      email: enabledFor(recipient.userId, "email"),
      whatsapp: enabledFor(recipient.userId, "whatsapp"),
    };
    if (!channels.inapp && !channels.email && !channels.whatsapp) continue;
    const notification = await insertNotification(db, ctx, {
      recipientUserId: recipient.userId, eventKind: input.eventKind,
      subjectRef: input.subjectRef, projectId: input.projectId ?? null,
      title: input.title, body: input.body ?? null,
    });
    for (const channel of ["email", "whatsapp"] as const) {
      if (!channels[channel]) continue;
      const delivery = await insertDelivery(db, ctx, { notificationId: notification.id, channel });
      await enqueueJob(db, {
        organizationId: ctx.organizationId,
        kind: NOTIFICATION_DELIVER_JOB,
        payload: { deliveryId: delivery.id },
        idempotencyKey: `${NOTIFICATION_DELIVER_JOB}:${delivery.id}`,
      });
    }
  }
}
