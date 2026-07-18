import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { getReport } from "@buildflow/db/queries/reports";
import { latestRevision } from "@buildflow/db/queries/revisions";
import { listAttachments } from "@buildflow/db/queries/attachments";
import { buildFieldRows } from "../view-model";
import { ReviewClient } from "./ReviewClient";
import type { DprStructuredData } from "@buildflow/domain/dpr/schema";
import { AppHeader } from "@/app/components/AppHeader";
import { AutoRefresh } from "@/app/components/AutoRefresh";
import { listClientLinks } from "@buildflow/db/queries/client-links";

export default async function ReportPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const db = await getDb();
  const ctx = await currentContext();
  const report = await getReport(db, ctx, id);
  const rev = await latestRevision(db, ctx, id);
  const atts = await listAttachments(db, ctx, id);
  const rows = rev ? buildFieldRows(rev.structuredData as DprStructuredData) : [];
  const transcript = (rev?.transcript as { text: string } | null)?.text ?? "";
  const photoIds = atts.filter((a) => a.kind === "photo").map((a) => a.id);
  const canApprove = ctx.capabilities.includes("report.approve");
  const canReview = ctx.capabilities.includes("report.review");
  const clientLinks = (report.status === "ISSUED" || report.status === "SUPERSEDED")
    ? await listClientLinks(db, ctx, id) : [];

  const processing = report.status === "UPLOADED" || report.status === "PROCESSING";
  return (
    <>
      {processing ? <AutoRefresh /> : null}
      <AppHeader
        roleLabel={canApprove ? "Project Manager" : "Site Engineer"}
        canCapture={ctx.capabilities.includes("report.create")}
      />
      <ReviewClient
        reportId={id}
        reportDate={report.reportDate}
        status={report.status}
        rows={rows}
        transcript={transcript}
        canApprove={canApprove}
        canIssue={ctx.capabilities.includes("report.issue")}
        canReview={canReview}
        photoCount={photoIds.length}
        clientLinkToken={typeof query.clientLink === "string" ? query.clientLink : null}
        activeClientLinks={clientLinks
          .filter((l) => !l.revokedAt && l.expiresAt.getTime() > Date.now())
          .map((l) => ({ id: l.id, expiresAt: l.expiresAt.toISOString() }))}
      />
    </>
  );
}
