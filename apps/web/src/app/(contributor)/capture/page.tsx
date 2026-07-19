import { AppHeader } from "@/app/components/AppHeader";
import { CaptureClient } from "./CaptureClient";
import { getDb } from "@buildflow/db/client";
import { listProjects } from "@buildflow/db/queries/projects";
import { projectToday } from "@buildflow/domain/date-time";
import { currentContext } from "@/app/session";
import { redirect } from "next/navigation";

export default async function CapturePage() {
  const db = await getDb();
  const ctx = await currentContext();
  const projects = await listProjects(db, ctx);
  const project = projects.find((item) => item.id === ctx.projectId) ?? projects[0];
  if (!project) redirect(ctx.capabilities.includes("org.manage") ? "/onboarding" : "/reports");
  const reportDate = projectToday(project.timezone);
  return (
    <>
      <AppHeader roleLabel="Site Engineer" canCapture />
      <main id="main-content" className="page-shell page-shell--narrow capture-page">
        <div className="capture-breadcrumb">
          <span>Today</span>
          <span aria-hidden="true">/</span>
          <strong>New site update</strong>
        </div>
        <div className="capture-heading">
          <div>
            <p className="eyebrow">{project.name}</p>
            <h1 className="page-title">Tell us what happened today.</h1>
            <p className="page-lead">
              Speak naturally. Mention work completed, labour, materials, blockers
              and tomorrow&apos;s plan.
            </p>
          </div>
          <div className="capture-date" aria-label="Report date">
            <small>REPORT DATE</small>
            <strong>
              {new Intl.DateTimeFormat("en-IN", {
                day: "2-digit",
                month: "short",
                timeZone: project.timezone,
              }).format(new Date(`${reportDate}T12:00:00.000Z`))}
            </strong>
          </div>
        </div>
        <CaptureClient reportDate={reportDate} />
      </main>
    </>
  );
}
