import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { getProject } from "@buildflow/db/queries/projects";
import { listAssignments, listEquipment, listEquipmentLogs, listServices } from "@buildflow/db/queries/equipment";
import { serviceReminders } from "@/core/equipment-core";
import { AppHeader } from "@/app/components/AppHeader";
import { ProjectNav } from "@/app/components/ProjectNav";
import {
  assignEquipmentAction, logEquipmentUseAction, markServiceDoneAction,
  registerEquipmentAction, scheduleServiceAction,
} from "@/app/actions/equipment";

export default async function EquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const base = await currentContext();
  const ctx = { ...base, projectId: id };
  const { project, register, assignments, logs, services, reminders } = await withTenant(db, ctx, async (tx) => {
    const project = await getProject(tx, ctx, id);
    const [register, assignments, logs, services, reminders] = await Promise.all([
      listEquipment(tx, ctx),
      listAssignments(tx, ctx, id),
      listEquipmentLogs(tx, ctx, { projectId: id }),
      listServices(tx, ctx),
      serviceReminders(tx, ctx),
    ]);
    return { project, register, assignments, logs, services, reminders };
  });
  const canManage = ctx.capabilities.includes("equipment.manage");
  const nameOf = new Map(register.map((e) => [e.id, e.name]));

  return (
    <>
      <AppHeader roleLabel="Project" canCapture={ctx.capabilities.includes("report.create")} projectName={project.name} />
      <main id="main-content" className="page-shell">
        <p className="eyebrow">Equipment</p>
        <h1 className="page-title">{project.name}</h1>
        <ProjectNav projectId={id} active="equipment" />

        {reminders.length > 0 ? (
          <section className="surface-card admin-section" aria-labelledby="eq-reminders">
            <h2 id="eq-reminders">Service reminders</h2>
            <p className="page-lead">Deterministic rules only: a due date inside the window, or logged hours reaching the interval.</p>
            <ul>
              {reminders.map((r) => (
                <li key={r.serviceId}>
                  <strong>{r.equipmentName}</strong> — {r.serviceName}: {r.reason}
                  {canManage ? (
                    <form action={markServiceDoneAction} className="admin-inline-form">
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="serviceId" value={r.serviceId} />
                      <button className="secondary-button" type="submit">Mark done</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="surface-card admin-section" aria-labelledby="eq-register">
          <h2 id="eq-register">Register</h2>
          {register.length === 0 ? (
            <p className="admin-empty">No equipment registered.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Equipment</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Ownership</th>
                  <th scope="col">Identifier</th>
                </tr>
              </thead>
              <tbody>
                {register.map((e) => (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td>{e.kind ?? "—"}</td>
                    <td>{e.ownership}</td>
                    <td>{e.identifier ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canManage ? (
            <details>
              <summary>Register equipment</summary>
              <form action={registerEquipmentAction} className="admin-form">
                <input type="hidden" name="projectId" value={id} />
                <div className="admin-form-row">
                  <label>Name <input name="name" required /></label>
                  <label>Kind <input name="kind" placeholder="mixer / excavator / crane" /></label>
                  <label>Ownership
                    <select name="ownership" defaultValue="owned">
                      <option value="owned">owned</option>
                      <option value="rented">rented</option>
                    </select>
                  </label>
                  <label>Identifier <input name="identifier" placeholder="Registration / asset no." /></label>
                </div>
                <button className="primary-button" type="submit">Register</button>
              </form>
            </details>
          ) : null}
          {canManage && register.length > 0 ? (
            <details>
              <summary>Assign to this project</summary>
              <form action={assignEquipmentAction} className="admin-form admin-form--inline">
                <input type="hidden" name="projectId" value={id} />
                <label>Equipment
                  <select name="equipmentId" required>
                    {register.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </label>
                <label>From <input type="date" name="fromDate" required /></label>
                <label>To <input type="date" name="toDate" /></label>
                <button className="secondary-button" type="submit">Assign</button>
              </form>
            </details>
          ) : null}
          {assignments.length > 0 ? (
            <ul>
              {assignments.map((a) => (
                <li key={a.id}>{nameOf.get(a.equipmentId) ?? a.equipmentId}: {a.fromDate} → {a.toDate ?? "ongoing"}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="surface-card admin-section" aria-labelledby="eq-logs">
          <h2 id="eq-logs">Usage log (append-only)</h2>
          {logs.length === 0 ? (
            <p className="admin-empty">No usage logged. Corrections are new entries — history never changes.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Equipment</th>
                  <th scope="col">Hours</th>
                  <th scope="col">Fuel (L)</th>
                  <th scope="col">Downtime</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 30).map((l) => (
                  <tr key={l.id}>
                    <td>{l.logDate}</td>
                    <td>{nameOf.get(l.equipmentId) ?? l.equipmentId}</td>
                    <td>{l.hoursUsed ?? "—"}</td>
                    <td>{l.fuelLitres ?? "—"}</td>
                    <td>{l.downtimeHours ?? "—"}</td>
                    <td>{l.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canManage && register.length > 0 ? (
            <form action={logEquipmentUseAction} className="admin-form">
              <input type="hidden" name="projectId" value={id} />
              <div className="admin-form-row">
                <label>Equipment
                  <select name="equipmentId" required>
                    {register.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </label>
                <label>Date <input type="date" name="logDate" required /></label>
                <label>Hours <input name="hoursUsed" inputMode="decimal" /></label>
                <label>Fuel (L) <input name="fuelLitres" inputMode="decimal" /></label>
                <label>Downtime <input name="downtimeHours" inputMode="decimal" /></label>
              </div>
              <label>Note <input name="note" /></label>
              <button className="secondary-button" type="submit">Add log entry</button>
            </form>
          ) : null}
        </section>

        <section className="surface-card admin-section" aria-labelledby="eq-services">
          <h2 id="eq-services">Service schedule</h2>
          {services.length === 0 ? (
            <p className="admin-empty">No services scheduled.</p>
          ) : (
            <ul>
              {services.map((s) => (
                <li key={s.id}>
                  {nameOf.get(s.equipmentId) ?? s.equipmentId} — {s.name}:
                  {s.dueDate ? ` due ${s.dueDate}` : ""}{s.dueHours ? ` due at ${s.dueHours} h` : ""}
                  {s.completedAt ? ` — done ${s.completedAt.toISOString().slice(0, 10)}` : ""}
                </li>
              ))}
            </ul>
          )}
          {canManage && register.length > 0 ? (
            <details>
              <summary>Schedule service</summary>
              <form action={scheduleServiceAction} className="admin-form admin-form--inline">
                <input type="hidden" name="projectId" value={id} />
                <label>Equipment
                  <select name="equipmentId" required>
                    {register.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </label>
                <label>Service <input name="name" required /></label>
                <label>Due date <input type="date" name="dueDate" /></label>
                <label>Due hours <input name="dueHours" inputMode="decimal" /></label>
                <button className="secondary-button" type="submit">Schedule</button>
              </form>
            </details>
          ) : null}
        </section>
      </main>
    </>
  );
}
