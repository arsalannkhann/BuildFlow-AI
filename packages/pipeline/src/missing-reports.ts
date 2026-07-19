import { and, eq, isNotNull } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { dailyReports, projects } from "@buildflow/db/schema";
import { enqueueJob } from "@buildflow/jobs/queue";
import type { JobRegistry } from "@buildflow/jobs/types";
import { notifyEvent } from "@buildflow/notify/emit";

export const REPORT_MISSING_JOB = "report.missing_notify";

/** Project-local date + HH:mm for cutoff comparison (IANA tz from project settings). */
function localParts(now: Date, timeZone: string): { date: string; hhmm: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}

/**
 * Missing-report escalation, step 1 (EXPANSION-ROADMAP R1): once a project's local time
 * passes its report cutoff with no report row for the local date, enqueue exactly one
 * notification job for that project-day. Exactly-once comes from the queue's unique
 * idempotency key — the sweep itself can run every minute from any number of workers.
 */
export async function sweepMissingReports(db: AppDb, now: Date = new Date()): Promise<number> {
  const candidates = await db.select().from(projects).where(isNotNull(projects.reportCutoff));
  let enqueued = 0;
  for (const project of candidates) {
    const cutoff = (project.reportCutoff ?? "").trim();
    if (!/^\d{2}:\d{2}$/.test(cutoff)) continue; // malformed settings never crash the sweep
    let local: { date: string; hhmm: string };
    try {
      local = localParts(now, project.timezone);
    } catch {
      continue; // invalid tz string on the project row
    }
    if (local.hhmm < cutoff) continue;
    const [existing] = await db.select({ id: dailyReports.id }).from(dailyReports).where(and(
      eq(dailyReports.organizationId, project.organizationId),
      eq(dailyReports.projectId, project.id),
      eq(dailyReports.reportDate, local.date),
    )).limit(1);
    if (existing) continue;
    await enqueueJob(db, {
      organizationId: project.organizationId,
      kind: REPORT_MISSING_JOB,
      payload: { projectId: project.id, projectName: project.name, date: local.date, cutoff },
      idempotencyKey: `${REPORT_MISSING_JOB}:${project.id}:${local.date}`,
    });
    enqueued += 1;
  }
  return enqueued;
}

export const missingReportJobRegistry: JobRegistry = {
  [REPORT_MISSING_JOB]: async (db, payload, meta) => {
    const projectId = String(payload.projectId);
    await notifyEvent(db, {
      organizationId: meta.organizationId,
      projectId,
      userId: "system:missing-report-sweep",
      capabilities: [],
    }, {
      eventKind: "report.missing",
      subjectRef: projectId,
      projectId,
      title: `No report yet for ${String(payload.projectName)} (${String(payload.date)})`,
      body: `The ${String(payload.cutoff)} cutoff passed without a submitted daily report.`,
    });
  },
};
