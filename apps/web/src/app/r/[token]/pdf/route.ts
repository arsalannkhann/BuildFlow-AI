import { getDb } from "@buildflow/db/client";
import { ensureBooted } from "@buildflow/db/boot";
import { resolveClientLink } from "@buildflow/db/queries/client-links";
import { audit } from "@buildflow/db/queries/audit";
import { getStorage } from "@buildflow/storage/factory";
import { rateLimitResponse, tracedRoute } from "@/core/request-security";

export async function GET(
  req: Request, { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  return tracedRoute(req, "GET /r/:token/pdf", async () => {
    await ensureBooted();
    const db = await getDb();
    const limited = await rateLimitResponse(db, req, {
      scope: "public-client-pdf", key: token, limit: 30, windowMs: 5 * 60_000,
    });
    if (limited) return limited;
    const resolved = await resolveClientLink(db, token);
    if (!resolved) return new Response("Not found", { status: 404 });

    await audit(db, {
      organizationId: resolved.link.organizationId,
      userId: `client-link:${resolved.link.id}`, capabilities: [],
    }, { action: "client_link.pdf_downloaded", subjectRef: resolved.report.id, metadata: { linkId: resolved.link.id } });

    const bytes = await getStorage().get(resolved.issued.objectKey);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="DPR-${resolved.report.reportDate}-v${resolved.issued.version}.pdf"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
