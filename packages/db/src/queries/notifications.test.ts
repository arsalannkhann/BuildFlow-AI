import { expect, test } from "vitest";
import { createTestDb } from "../client";
import { seed, SEED } from "../seed";
import { projects } from "../schema";
import type { TenantContext } from "@buildflow/domain/tenancy";
import {
  insertNotification, listMyNotifications, markNotificationRead,
  recipientsWithCapability, unreadNotificationCount, upsertPreference, listPreferences,
} from "./notifications";

const ctxFor = (userId: string, organizationId = SEED.orgId): TenantContext =>
  ({ organizationId, userId, capabilities: [] });

test("recipient resolution merges org-wide and project memberships by capability", async () => {
  const db = await createTestDb();
  await seed(db);
  const ctx = ctxFor(SEED.engineer.id);

  // material.manage on the seeded project: owner (org-wide) + engineer. The manager holds
  // material.review, NOT material.manage — capability scoping keeps them out.
  const managers = await recipientsWithCapability(db, ctx, {
    projectId: SEED.projectId, capability: "material.manage",
  });
  expect(managers.map((r) => r.userId).sort()).toEqual([SEED.engineer.id, SEED.owner.id].sort());

  // On a different project only org-wide memberships apply.
  await db.insert(projects).values({ id: "p2", organizationId: SEED.orgId, name: "Tower B" });
  const reviewersP2 = await recipientsWithCapability(db, ctx, {
    projectId: "p2", capability: "report.review",
  });
  expect(reviewersP2.map((r) => r.userId)).toEqual([SEED.owner.id]);

  // Nobody without the capability ever appears (mb.certify: only the org owner bundle).
  const certifiers = await recipientsWithCapability(db, ctx, {
    projectId: SEED.projectId, capability: "mb.certify",
  });
  expect(certifiers.map((r) => r.userId)).toEqual([SEED.owner.id]);
});

test("cross-tenant access fails closed for notifications, counts, and preferences", async () => {
  const db = await createTestDb();
  await seed(db);
  const mine = ctxFor(SEED.manager.id);
  await insertNotification(db, mine, {
    recipientUserId: SEED.manager.id, eventKind: "report.awaiting_review",
    subjectRef: "r-1", projectId: SEED.projectId, title: "DPR 2026-07-19 is ready for review",
  });
  await upsertPreference(db, mine, {
    userId: SEED.manager.id, eventKind: "report.awaiting_review", channel: "email", enabled: false,
  });

  expect(await listMyNotifications(db, mine)).toHaveLength(1);
  expect(await unreadNotificationCount(db, mine)).toBe(1);

  const foreign = ctxFor(SEED.manager.id, "org-elsewhere");
  expect(await listMyNotifications(db, foreign)).toEqual([]);
  expect(await unreadNotificationCount(db, foreign)).toBe(0);
  expect(await listPreferences(db, foreign, [SEED.manager.id])).toEqual([]);
  expect(await recipientsWithCapability(db, foreign, {
    projectId: SEED.projectId, capability: "report.review",
  })).toEqual([]);

  // A foreign markRead is a no-op — the row stays unread for its real tenant.
  const [row] = await listMyNotifications(db, mine);
  await markNotificationRead(db, foreign, row.id);
  expect(await unreadNotificationCount(db, mine)).toBe(1);

  // Another recipient in the SAME org never sees someone else's rows either.
  expect(await listMyNotifications(db, ctxFor(SEED.engineer.id))).toEqual([]);
});
