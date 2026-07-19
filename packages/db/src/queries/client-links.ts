import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { clientLinks, dailyReports, issuedDocuments, reportRevisions } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { withPublicToken, withTenant } from "@buildflow/db/tenant";

const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");
const LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ClientLinkRow = typeof clientLinks.$inferSelect;

export async function addClientLink(db: AppDb, ctx: TenantContext, input: {
  reportId: string; issuedDocumentId: string;
}): Promise<{ id: string; token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const id = newId();
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  await db.insert(clientLinks).values({
    id, organizationId: ctx.organizationId, reportId: input.reportId,
    issuedDocumentId: input.issuedDocumentId, tokenHash: tokenHash(token),
    createdBy: ctx.userId, expiresAt,
  });
  return { id, token, expiresAt };
}

export async function listClientLinks(
  db: AppDb, ctx: TenantContext, reportId: string,
): Promise<ClientLinkRow[]> {
  return db.select().from(clientLinks).where(and(
    eq(clientLinks.reportId, reportId), eq(clientLinks.organizationId, ctx.organizationId)));
}

export async function revokeClientLink(
  db: AppDb, ctx: TenantContext, linkId: string,
): Promise<void> {
  await db.update(clientLinks).set({ revokedAt: new Date() }).where(and(
    eq(clientLinks.id, linkId), eq(clientLinks.organizationId, ctx.organizationId)));
}

export type ResolvedClientLink = {
  link: ClientLinkRow;
  report: typeof dailyReports.$inferSelect;
  issued: typeof issuedDocuments.$inferSelect;
  revision: typeof reportRevisions.$inferSelect;
};

/** Token-authenticated resolution for the public client page. The token itself is the
 * credential; expiry and revocation fail closed. Returns only issued, client-safe data. */
export async function resolveClientLink(
  db: AppDb, rawToken: string,
): Promise<ResolvedClientLink | null> {
  // Only the token lookup itself is pre-tenant; the row it returns names the organization,
  // so the documents it points at are read under that tenant's normal RLS context.
  const [link] = await withPublicToken(db, (tx) => tx.select().from(clientLinks)
    .where(eq(clientLinks.tokenHash, tokenHash(rawToken))));
  if (!link) return null;
  if (link.revokedAt || link.expiresAt.getTime() <= Date.now()) return null;
  const linkCtx: TenantContext = {
    organizationId: link.organizationId, userId: "client-link", capabilities: [],
  };
  return withTenant(db, linkCtx, async (tx) => {
    const [issued] = await tx.select().from(issuedDocuments).where(and(
      eq(issuedDocuments.id, link.issuedDocumentId),
      eq(issuedDocuments.organizationId, link.organizationId)));
    if (!issued) return null;
    const [report] = await tx.select().from(dailyReports).where(and(
      eq(dailyReports.id, link.reportId), eq(dailyReports.organizationId, link.organizationId)));
    const [revision] = await tx.select().from(reportRevisions).where(and(
      eq(reportRevisions.id, issued.revisionId),
      eq(reportRevisions.organizationId, link.organizationId)));
    if (!report || !revision) return null;
    return { link, report, issued, revision };
  });
}
