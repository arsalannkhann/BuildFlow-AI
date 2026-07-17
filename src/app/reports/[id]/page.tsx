import { getDb } from "@/db/client";
import { currentContext } from "@/app/session";
import { getReport } from "@/db/queries/reports";
import { latestRevision } from "@/db/queries/revisions";
import { listAttachments } from "@/db/queries/attachments";
import { buildFieldRows } from "../view-model";
import { ReviewClient } from "./ReviewClient";
import type { DprStructuredData } from "@/domain/dpr/schema";
import { AppHeader } from "@/app/components/AppHeader";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const ctx = await currentContext();
  const report = await getReport(db, ctx, id);
  const rev = await latestRevision(db, ctx, id);
  const atts = await listAttachments(db, ctx, id);
  const rows = rev ? buildFieldRows(rev.structuredData as DprStructuredData) : [];
  const transcript = (rev?.transcript as { text: string } | null)?.text ?? "";
  const photoIds = atts.filter((a) => a.kind === "photo").map((a) => a.id);
  const canApprove = ctx.capabilities.includes("report.approve");

  return (
    <>
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
        photoCount={photoIds.length}
      />
    </>
  );
}
