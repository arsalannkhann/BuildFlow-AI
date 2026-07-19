import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { getMbEntry, listMbEvidence } from "@buildflow/db/queries/mb";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import {
  addMbEvidenceAction, certifyMbEntryAction, correctMbEntryAction, editMbEntryAction,
  rejectMbEntryAction, submitMbEntryAction, verifyMbEntryAction,
} from "@/app/actions/mb";

export default async function MbEntryPage({ params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const project = await getProject(db, ctx, id);
  const entry = await getMbEntry(db, ctx, entryId);
  if (!entry || entry.projectId !== id) notFound();
  const evidence = await listMbEvidence(db, ctx, entryId);
  const canCreate = ctx.capabilities.includes("mb.create");
  const canVerify = ctx.capabilities.includes("mb.verify");
  const canCertify = ctx.capabilities.includes("mb.certify");
  const editable = ["draft", "rejected"].includes(entry.status);

  const dimFields = (
    <>
      <div className="admin-form-row">
        <label>Work item description <input name="description" defaultValue={entry.description} required /></label>
        <label>Date <input type="date" name="measurementDate" defaultValue={entry.measurementDate} required /></label>
        <label>Unit <input name="unit" defaultValue={entry.unit} required /></label>
      </div>
      <div className="admin-form-row">
        <label>Length (L) <input name="length" inputMode="decimal" defaultValue={entry.length ?? ""} /></label>
        <label>Breadth (B) <input name="breadth" inputMode="decimal" defaultValue={entry.breadth ?? ""} /></label>
        <label>Depth (D) <input name="depth" inputMode="decimal" defaultValue={entry.depth ?? ""} /></label>
        <label>Count (n) <input type="number" name="count" min={1} defaultValue={entry.count ?? ""} /></label>
      </div>
    </>
  );

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Measurement Book (e-MB Preview)</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="mb" />

        <section className="surface-card admin-section" aria-labelledby="mbe-head">
          <h2 id="mbe-head">MB-{entry.mbNumber} — {entry.description}</h2>
          <p>
            Status: <strong>{entry.status}</strong> · {entry.measurementDate} ·
            Quantity: <strong>{entry.quantity} {entry.unit}</strong> (formula {entry.formula}
            {[entry.length, entry.breadth, entry.depth].filter((v) => v != null).length > 0
              ? ` = ${[entry.length, entry.breadth, entry.depth].filter((v) => v != null).join(" × ")}${entry.count != null ? ` × ${entry.count}` : ""}`
              : entry.count != null ? ` = ${entry.count}` : ""})
          </p>
          {entry.rejectionReason ? <p><strong>Rejected:</strong> {entry.rejectionReason}</p> : null}
          {entry.correctsEntryId ? (
            <p>Correction of <Link href={`/projects/${id}/mb/${entry.correctsEntryId}`}>the superseded entry</Link>.</p>
          ) : null}
          {entry.supersededBy ? (
            <p>Superseded by <Link href={`/projects/${id}/mb/${entry.supersededBy}`}>a correction</Link> — values here never change.</p>
          ) : null}
          <p className="muted-copy">
            e-MB Preview — not legally authoritative. Created by {entry.createdBy === ctx.userId ? "you" : "site staff"}
            {entry.verifiedBy ? `; verified ${entry.verifiedAt?.toISOString().slice(0, 10)}` : ""}
            {entry.certifiedBy ? `; certified ${entry.certifiedAt?.toISOString().slice(0, 10)}` : ""}.
          </p>
        </section>

        {editable && canCreate ? (
          <section className="surface-card admin-section" aria-labelledby="mbe-edit">
            <h2 id="mbe-edit">Edit draft</h2>
            <form action={editMbEntryAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="entryId" value={entryId} />
              {dimFields}
              <button className="secondary-button" type="submit">Recompute and save</button>
            </form>
            <form action={submitMbEntryAction}>
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="entryId" value={entryId} />
              <button className="primary-button" type="submit">Submit for verification</button>
            </form>
          </section>
        ) : null}

        {entry.status === "submitted" && canVerify ? (
          <section className="surface-card admin-section" aria-labelledby="mbe-verify">
            <h2 id="mbe-verify">Verify</h2>
            <form action={verifyMbEntryAction}>
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="entryId" value={entryId} />
              <button className="primary-button" type="submit">Verify measurement</button>
            </form>
            <form action={rejectMbEntryAction} className="admin-form admin-form--inline">
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="entryId" value={entryId} />
              <label>Reason <input name="reason" required /></label>
              <button className="danger-button" type="submit">Reject</button>
            </form>
          </section>
        ) : null}

        {entry.status === "verified" && canCertify ? (
          <section className="surface-card admin-section" aria-labelledby="mbe-certify">
            <h2 id="mbe-certify">Certify</h2>
            <p className="muted-copy">Certification freezes this entry permanently. Later changes require a correction entry.</p>
            <form action={certifyMbEntryAction}>
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="entryId" value={entryId} />
              <button className="primary-button" type="submit">Certify (append-only from here)</button>
            </form>
          </section>
        ) : null}

        {entry.status === "certified" && !entry.supersededBy && canCreate ? (
          <section className="surface-card admin-section" aria-labelledby="mbe-correct">
            <h2 id="mbe-correct">Record correction</h2>
            <p className="muted-copy">
              Creates a NEW draft entry linked to this one; this certified entry is never edited.
              The correction goes through verification and certification again.
            </p>
            <form action={correctMbEntryAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="entryId" value={entryId} />
              {dimFields}
              <button className="secondary-button" type="submit">Create correction entry</button>
            </form>
          </section>
        ) : null}

        <section className="surface-card admin-section" aria-labelledby="mbe-evidence">
          <h2 id="mbe-evidence">Evidence photos</h2>
          {evidence.length === 0 ? (
            <p className="admin-empty">No evidence attached.</p>
          ) : (
            <ul>
              {evidence.map((ev) => (
                <li key={ev.id}>
                  {ev.fileName ?? ev.objectKey} · sha256 {ev.checksum.slice(0, 12)}…
                  {ev.latitude != null && ev.longitude != null
                    ? ` · reported location ${ev.latitude.toFixed(5)}, ${ev.longitude.toFixed(5)}`
                    : " · no location metadata"}
                  {ev.capturedAt ? ` · captured ${ev.capturedAt.toISOString()}` : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="muted-copy">Photo location and time are device metadata — shown as metadata, not guaranteed truth.</p>
          {entry.status !== "certified" && canCreate ? (
            <form action={addMbEvidenceAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="entryId" value={entryId} />
              <label>Photo <input type="file" name="photo" accept="image/*" required /></label>
              <div className="admin-form-row">
                <label>Latitude <input name="latitude" inputMode="decimal" /></label>
                <label>Longitude <input name="longitude" inputMode="decimal" /></label>
              </div>
              <button className="secondary-button" type="submit">Attach evidence</button>
            </form>
          ) : null}
        </section>
      </main>
    </>
  );
}
