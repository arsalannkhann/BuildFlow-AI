import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import type { AppDb } from "../client";
import { createTestDb } from "../client";
import { seed, SEED } from "../seed";
import { createInvitation, findPendingInvitation, acceptInvitation } from "../queries/invitations";
import { addClientLink, resolveClientLink } from "../queries/client-links";
import { dailyReports, issuedDocuments, reportRevisions } from "../schema";

// Production connects as `buildflow_app`, which holds no BYPASSRLS, so every one of these
// paths is exercised under that role. A superuser connection bypasses RLS and would pass
// these tests even if the sanctioned paths were removed.
async function asAppRole<T>(db: AppDb, fn: () => Promise<T>): Promise<T> {
  await db.execute(sql`set role buildflow_app`);
  try {
    return await fn();
  } finally {
    await db.execute(sql`reset role`);
  }
}

const ctx = {
  organizationId: SEED.orgId, projectId: SEED.projectId,
  userId: SEED.owner.id, capabilities: [],
} as never;

test("an invitation link resolves and can be accepted under the application role", async () => {
  const db = await createTestDb();
  await seed(db);
  const { token } = await createInvitation(db, ctx, {
    email: "newjoiner@example.test", role: "site_engineer",
  });

  const found = await asAppRole(db, () => findPendingInvitation(db, token));
  expect(found).not.toBeNull();

  const accepted = await asAppRole(db, () => acceptInvitation(db, {
    token, displayName: "New Joiner", password: "correct-horse-battery",
  }));
  expect(accepted?.organizationId).toBe(SEED.orgId);
  expect(accepted?.email).toBe("newjoiner@example.test");
});

test("an unknown invitation token still resolves to nothing", async () => {
  const db = await createTestDb();
  await seed(db);
  expect(await asAppRole(db, () => findPendingInvitation(db, "not-a-real-token"))).toBeNull();
});

test("a client share link resolves its report under the application role", async () => {
  const db = await createTestDb();
  await seed(db);
  await db.insert(dailyReports).values({
    id: "rls-r1", organizationId: SEED.orgId, projectId: SEED.projectId,
    reportDate: "2026-07-20", status: "APPROVED", createdBy: SEED.owner.id,
  });
  await db.insert(reportRevisions).values({
    id: "rls-rev1", organizationId: SEED.orgId, reportId: "rls-r1",
    revisionNumber: 1, structuredData: {}, createdBy: SEED.owner.id,
  });
  await db.insert(issuedDocuments).values({
    id: "rls-doc1", organizationId: SEED.orgId, reportId: "rls-r1",
    revisionId: "rls-rev1", version: 1, objectKey: "k", documentId: "rls-docnum-1",
    issuedBy: SEED.owner.id, templateVersion: "v1",
  });
  const { token } = await addClientLink(db, ctx, {
    reportId: "rls-r1", issuedDocumentId: "rls-doc1",
  });

  const resolved = await asAppRole(db, () => resolveClientLink(db, token));

  expect(resolved).not.toBeNull();
  expect(resolved!.report.id).toBe("rls-r1");
  expect(resolved!.issued.id).toBe("rls-doc1");
});

// The public-token path is reachable by anyone holding a URL, so it must stay SELECT-only
// and must not expose the tenant tables the resolved row points at.
test("the public-token path grants no writes and no reach into tenant tables", async () => {
  const db = await createTestDb();
  await seed(db);
  const { withPublicToken } = await import("../tenant");

  await asAppRole(db, async () => {
    const reports = await withPublicToken(db, (tx) => tx.select().from(dailyReports));
    expect(reports).toEqual([]);

    await withPublicToken(db, (tx) => tx.execute(
      sql`update "invitation" set status = 'accepted'`,
    ));
  });

  const [row] = await db.execute(sql`select count(*)::int as n from "invitation" where status = 'accepted'`)
    .then((r) => (r as unknown as { rows: { n: number }[] }).rows);
  expect(row.n).toBe(0);
});
