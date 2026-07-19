import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { getRfi, listRfiResponses } from "@buildflow/db/queries/controls";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import { respondToRfiAction, setRfiStatusAction } from "@/app/actions/controls";
import { notFound } from "next/navigation";

export default async function RfiDetailPage({ params }: { params: Promise<{ id: string; rfiId: string }> }) {
  const { id, rfiId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const project = await getProject(db, ctx, id);
  const rfi = await getRfi(db, ctx, rfiId);
  if (!rfi || rfi.projectId !== id) notFound();
  const responses = await listRfiResponses(db, ctx, rfiId);
  const canManage = ctx.capabilities.includes("rfi.manage");

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">{project.name} · RFI-{String(rfi.number).padStart(3, "0")} · {rfi.status}</p>
        <h1 className="page-title">{rfi.subject}</h1>
        <ProjectNav projectId={id} active="rfis" />

        <section className="surface-card admin-section" aria-labelledby="rfi-q">
          <h2 id="rfi-q">Question</h2>
          <p>{rfi.question}</p>
          <p><small>Assignee: {rfi.assigneeName ?? "—"} · Due: {rfi.dueDate ?? "—"}</small></p>
          {canManage ? (
            <form action={setRfiStatusAction} className="admin-form admin-form--inline">
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="rfiId" value={rfi.id} />
              <label>Status
                <select name="status" defaultValue={rfi.status}>
                  <option value="open">open</option>
                  <option value="answered">answered</option>
                  <option value="closed">closed</option>
                </select>
              </label>
              <button className="secondary-button" type="submit">Update status</button>
            </form>
          ) : null}
        </section>

        <section className="surface-card admin-section" aria-labelledby="rfi-thread">
          <h2 id="rfi-thread">Responses ({responses.length})</h2>
          {responses.length === 0 ? <p className="admin-empty">No responses yet.</p> : (
            <ul>
              {responses.map((r) => (
                <li key={r.id}>
                  <p>{r.body}</p>
                  <small>
                    {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    {r.fileName ? ` · attachment: ${r.fileName}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          )}
          {canManage ? (
            <form action={respondToRfiAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="rfiId" value={rfi.id} />
              <label>Response <textarea name="body" rows={3} required /></label>
              <label>Attachment <input type="file" name="file" /></label>
              <label className="admin-inline-form">
                <input type="checkbox" name="markAnswered" defaultChecked /> Mark as answered
              </label>
              <button className="primary-button" type="submit">Post response</button>
            </form>
          ) : null}
        </section>
      </main>
    </>
  );
}
