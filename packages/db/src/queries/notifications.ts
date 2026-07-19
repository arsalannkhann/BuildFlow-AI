import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import {
  memberships, notificationDeliveries, notificationPreferences, notifications, users,
} from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { Capability, TenantContext } from "@buildflow/domain/tenancy";

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationDeliveryRow = typeof notificationDeliveries.$inferSelect;
export type NotificationPreferenceRow = typeof notificationPreferences.$inferSelect;

const org = (ctx: TenantContext) => ctx.organizationId;

// --- recipient resolution ---

export type Recipient = { userId: string; displayName: string; email: string | null };

/**
 * Active org members holding `capability` for the given project: an org-wide membership
 * (project_id IS NULL) or a membership on that project. Capabilities are checked from the
 * stored snapshot — the same source resolveTenantContext trusts.
 */
export async function recipientsWithCapability(
  db: AppDb, ctx: TenantContext, input: { projectId?: string | null; capability: Capability },
): Promise<Recipient[]> {
  const rows = await db.select({ m: memberships, u: users }).from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(
      eq(memberships.organizationId, org(ctx)),
      eq(users.organizationId, org(ctx)),
      eq(users.isActive, true),
      input.projectId
        ? or(isNull(memberships.projectId), eq(memberships.projectId, input.projectId))
        : undefined,
    ));
  const byUser = new Map<string, Recipient>();
  for (const { m, u } of rows) {
    if (!m.capabilities.includes(input.capability)) continue;
    byUser.set(u.id, { userId: u.id, displayName: u.displayName, email: u.email });
  }
  return [...byUser.values()];
}

// --- notifications ---

export async function insertNotification(db: AppDb, ctx: TenantContext, input: {
  recipientUserId: string; eventKind: string; subjectRef: string;
  projectId?: string | null; title: string; body?: string | null;
}): Promise<NotificationRow> {
  const [row] = await db.insert(notifications).values({
    id: newId(), organizationId: org(ctx), recipientUserId: input.recipientUserId,
    eventKind: input.eventKind, subjectRef: input.subjectRef,
    projectId: input.projectId ?? null, title: input.title, body: input.body ?? null,
  }).returning();
  return row;
}

/** The signed-in user's own notifications, newest first. Recipient scoping is absolute. */
export async function listMyNotifications(
  db: AppDb, ctx: TenantContext, opts?: { limit?: number; unreadOnly?: boolean },
): Promise<NotificationRow[]> {
  return db.select().from(notifications).where(and(
    eq(notifications.organizationId, org(ctx)),
    eq(notifications.recipientUserId, ctx.userId),
    opts?.unreadOnly ? isNull(notifications.readAt) : undefined,
  )).orderBy(desc(notifications.createdAt)).limit(Math.min(opts?.limit ?? 100, 200));
}

export async function unreadNotificationCount(db: AppDb, ctx: TenantContext): Promise<number> {
  const [row] = await db.select({ n: sql<string>`count(*)::text` }).from(notifications).where(and(
    eq(notifications.organizationId, org(ctx)),
    eq(notifications.recipientUserId, ctx.userId),
    isNull(notifications.readAt),
  ));
  return Number(row?.n ?? 0);
}

export async function markNotificationRead(db: AppDb, ctx: TenantContext, id: string): Promise<void> {
  await db.update(notifications).set({ readAt: new Date() }).where(and(
    eq(notifications.organizationId, org(ctx)),
    eq(notifications.recipientUserId, ctx.userId),
    eq(notifications.id, id),
  ));
}

export async function markAllNotificationsRead(db: AppDb, ctx: TenantContext): Promise<void> {
  await db.update(notifications).set({ readAt: new Date() }).where(and(
    eq(notifications.organizationId, org(ctx)),
    eq(notifications.recipientUserId, ctx.userId),
    isNull(notifications.readAt),
  ));
}

// --- deliveries ---

export async function insertDelivery(db: AppDb, ctx: TenantContext, input: {
  notificationId: string; channel: string;
}): Promise<NotificationDeliveryRow> {
  const [row] = await db.insert(notificationDeliveries).values({
    id: newId(), organizationId: org(ctx),
    notificationId: input.notificationId, channel: input.channel,
  }).returning();
  return row;
}

export async function getDelivery(
  db: AppDb, ctx: TenantContext, id: string,
): Promise<NotificationDeliveryRow | null> {
  const [row] = await db.select().from(notificationDeliveries)
    .where(and(eq(notificationDeliveries.organizationId, org(ctx)), eq(notificationDeliveries.id, id)));
  return row ?? null;
}

export async function getNotification(
  db: AppDb, ctx: TenantContext, id: string,
): Promise<NotificationRow | null> {
  const [row] = await db.select().from(notifications)
    .where(and(eq(notifications.organizationId, org(ctx)), eq(notifications.id, id)));
  return row ?? null;
}

export async function getUser(
  db: AppDb, ctx: TenantContext, userId: string,
): Promise<{ id: string; displayName: string; email: string | null } | null> {
  const [row] = await db.select().from(users)
    .where(and(eq(users.organizationId, org(ctx)), eq(users.id, userId)));
  return row ? { id: row.id, displayName: row.displayName, email: row.email } : null;
}

export async function updateDelivery(db: AppDb, ctx: TenantContext, id: string, patch: Partial<{
  status: string; attempts: number; lastError: string | null; providerMessageId: string | null;
}>): Promise<void> {
  await db.update(notificationDeliveries).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(notificationDeliveries.organizationId, org(ctx)), eq(notificationDeliveries.id, id)));
}

/** Deliveries for a set of the caller's notifications (for the /notifications page). */
export async function listDeliveriesFor(
  db: AppDb, ctx: TenantContext, notificationIds: string[],
): Promise<NotificationDeliveryRow[]> {
  if (notificationIds.length === 0) return [];
  return db.select().from(notificationDeliveries).where(and(
    eq(notificationDeliveries.organizationId, org(ctx)),
    inArray(notificationDeliveries.notificationId, notificationIds),
  ));
}

// --- preferences ---

export async function listPreferences(
  db: AppDb, ctx: TenantContext, userIds: string[],
): Promise<NotificationPreferenceRow[]> {
  if (userIds.length === 0) return [];
  return db.select().from(notificationPreferences).where(and(
    eq(notificationPreferences.organizationId, org(ctx)),
    inArray(notificationPreferences.userId, userIds),
  ));
}

export async function upsertPreference(db: AppDb, ctx: TenantContext, input: {
  userId: string; eventKind: string; channel: string; enabled: boolean;
}): Promise<void> {
  await db.insert(notificationPreferences).values({
    id: newId(), organizationId: org(ctx), userId: input.userId,
    eventKind: input.eventKind, channel: input.channel, enabled: input.enabled,
  }).onConflictDoUpdate({
    target: [notificationPreferences.userId, notificationPreferences.eventKind, notificationPreferences.channel],
    set: { enabled: input.enabled },
  });
}
