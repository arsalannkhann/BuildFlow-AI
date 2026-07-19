import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
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
import { listReportLinks, listScheduleItems } from "@buildflow/db/queries/controls";
import { linkReportAction, raiseBlockerAction } from "@/app/actions/controls";
import { getProject } from "@buildflow/db/queries/projects";

export default async function ReportPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const db = await getDb();
  const ctx = await currentContext();
  const { report, project, rev, atts } = await withTenant(db, ctx, async (tx) => {
    const report = await getReport(tx, ctx, id);
    const project = await getProject(tx, ctx, report.projectId);
    const rev = await latestRevision(tx, ctx, id);
    const atts = await listAttachments(tx, ctx, id);
    return { report, project, rev, atts };
  });
  const rows = rev ? buildFieldRows(rev.structuredData as DprStructuredData) : [];
  const transcript = (rev?.transcript as { text: string } | null)?.text ?? "";
  const photoIds = atts.filter((a) => a.kind === "photo").map((a) => a.id);
  const canApprove = ctx.capabilities.includes("report.approve");
  const canReview = ctx.capabilities.includes("report.review");
  const clientLinks = (report.status === "ISSUED" || report.status === "SUPERSEDED")
    ? await withTenant(db, ctx, (tx) => listClientLinks(tx, ctx, id)) : [];
  const isApproved = ["APPROVED", "ISSUED", "SUPERSEDED"].includes(report.status);
  const projectCtx = { ...ctx, projectId: report.projectId };
  const canLinkSchedule = isApproved && ctx.capabilities.includes("schedule.manage");
  const scheduleItems = canLinkSchedule
    ? await withTenant(db, projectCtx, (tx) => listScheduleItems(tx, projectCtx, report.projectId)) : [];
  const scheduleLinks = canLinkSchedule
    ? await withTenant(db, projectCtx, (tx) => listReportLinks(tx, projectCtx, { reportId: id })) : [];
  const canTrackBlockers = isApproved && ctx.capabilities.includes("blocker.manage");
  const extractedBlockers = canTrackBlockers && rev
    ? (rev.structuredData as DprStructuredData).blockers : [];

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
        projectName={project.name}
        projectTimezone={project.timezone}
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
      {canLinkSchedule ? (
        <section className="page-shell surface-card admin-section" aria-labelledby="rep-schedule">
          <h2 id="rep-schedule">Schedule links</h2>
          <p className="page-lead">
            Link this approved report to the schedule activities it evidences. Linking never
            changes a progress percentage.
          </p>
          {scheduleLinks.length > 0 ? (
            <ul>
              {scheduleLinks.map((l) => (
                <li key={l.id}>
                  {scheduleItems.find((s) => s.id === l.scheduleItemId)?.name ?? l.scheduleItemId}
                  {l.note ? ` — ${l.note}` : ""}
                </li>
              ))}
            </ul>
          ) : <p className="admin-empty">Not linked to any schedule activity yet.</p>}
          {scheduleItems.length > 0 ? (
            <form action={linkReportAction} className="admin-form admin-form--inline">
              <input type="hidden" name="projectId" value={report.projectId} />
              <input type="hidden" name="reportId" value={id} />
              <label>Activity
                <select name="scheduleItemId" required>
                  {scheduleItems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label>Note <input name="note" placeholder="What does this report evidence?" /></label>
              <button className="secondary-button" type="submit">Link report</button>
            </form>
          ) : (
            <p className="admin-empty">No schedule items exist yet — add them on the Schedule page.</p>
          )}
        </section>
      ) : null}
      {canTrackBlockers && extractedBlockers.length > 0 ? (
        <section className="page-shell surface-card admin-section" aria-labelledby="rep-blockers">
          <h2 id="rep-blockers">Track extracted blockers</h2>
          <p className="page-lead">Promote blockers stated in this approved report into tracked project blockers.</p>
          <ul>
            {extractedBlockers.map((b, i) => (
              <li key={i}>
                {b.description}
                <form action={raiseBlockerAction} className="admin-inline-form">
                  <input type="hidden" name="projectId" value={report.projectId} />
                  <input type="hidden" name="reportId" value={id} />
                  <input type="hidden" name="title" value={b.description.slice(0, 200)} />
                  <input type="hidden" name="description"
                    value={[b.cause ? `Cause: ${b.cause}` : "", b.owner ? `Owner: ${b.owner}` : ""].filter(Boolean).join(" · ")} />
                  <input type="hidden" name="ownerName" value={b.owner ?? ""} />
                  <input type="hidden" name="returnTo" value={`/reports/${id}`} />
                  <button className="secondary-button" type="submit">Track as blocker</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
