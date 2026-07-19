import type { AppDb } from "@buildflow/db/client";
import type { JobMeta } from "@buildflow/jobs/types";
import type { TenantContext } from "@buildflow/domain/tenancy";
import {
  getDelivery, getNotification, getUser, updateDelivery,
} from "@buildflow/db/queries/notifications";
import { getNotifyRegistry } from "./registry";
import type { NotifyRegistry } from "./ports";

// Matches enqueueJob's default maxAttempts; when the job dead-letters, the delivery row
// is marked dead too so the recipient-facing status ("could not be delivered") is honest.
export const DELIVER_MAX_ATTEMPTS = 5;

/**
 * `notification.deliver` job handler. Idempotent: a replay of an already-sent delivery is
 * a no-op. On adapter failure the delivery row records the attempt + error and the error
 * is rethrown so the job queue's retry/backoff/dead-letter machinery drives the retries.
 */
export async function deliverNotification(
  db: AppDb, payload: Record<string, unknown>, meta: JobMeta,
  registry: NotifyRegistry = getNotifyRegistry(),
): Promise<void> {
  // System context: delivery re-reads everything org-scoped; no capability-gated actions.
  const ctx: TenantContext = { organizationId: meta.organizationId, userId: "system", capabilities: [] };
  const delivery = await getDelivery(db, ctx, String(payload.deliveryId));
  if (!delivery) throw new Error(`Delivery not found: ${String(payload.deliveryId)}`);
  if (delivery.status === "sent") return; // idempotent replay

  const notification = await getNotification(db, ctx, delivery.notificationId);
  if (!notification) throw new Error(`Notification not found: ${delivery.notificationId}`);
  const user = await getUser(db, ctx, notification.recipientUserId);
  if (!user) throw new Error(`Recipient not found: ${notification.recipientUserId}`);

  // Payload stays operational: title/body were built from record references upstream
  // (rules.md §14 — no report narrative in external messages).
  const text = notification.body ? `${notification.title}\n\n${notification.body}` : notification.title;
  try {
    let providerMessageId: string;
    if (delivery.channel === "email") {
      const res = await registry.email.send({
        to: user.email ?? user.id, subject: notification.title, text,
      });
      providerMessageId = res.providerMessageId;
    } else if (delivery.channel === "whatsapp") {
      // User profiles carry no mobile number yet; the local mock addresses by email/id.
      const res = await registry.whatsapp.send({ to: user.email ?? user.id, text });
      providerMessageId = res.providerMessageId;
    } else {
      throw new Error(`Unknown delivery channel: ${delivery.channel}`);
    }
    await updateDelivery(db, ctx, delivery.id, {
      status: "sent", attempts: delivery.attempts + 1, lastError: null, providerMessageId,
    });
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
    await updateDelivery(db, ctx, delivery.id, {
      status: meta.attempt >= DELIVER_MAX_ATTEMPTS ? "dead" : "failed",
      attempts: delivery.attempts + 1, lastError: message,
    });
    throw err; // let the job queue schedule the retry / dead-letter
  }
}
