"use client";
import { useState } from "react";
import { unresolvedCount, type FieldRow } from "../view-model";
import { approveAction, requestChangesAction, issueAction } from "@/app/actions/review";

const bandStyle: Record<string, string> = {
  Supported: "bg-success-100 text-success-700",
  Check: "bg-warning-100 text-warning-700",
  Missing: "bg-[var(--neutral-200)] text-[var(--neutral-700)]",
};

export function ReviewClient(props: {
  reportId: string; status: string; rows: FieldRow[]; transcript: string;
  canApprove: boolean; canIssue: boolean; photoCount: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const unresolved = unresolvedCount(props.rows);

  return (
    <main className="mx-auto grid max-w-5xl gap-4 p-6 md:grid-cols-2">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-brand-900">Report review</h1>
          <span className="rounded-control bg-brand-100 px-2 py-1 text-sm text-brand-900">{props.status}</span>
        </div>
        <p className="rounded-card bg-brand-100 p-3 text-sm text-brand-900">
          Drafted from the submitted voice note and photos. Confirm highlighted items before approval.
        </p>
        {props.rows.map((r) => (
          <button key={r.path} onClick={() => setSelected(r.path)}
            className={`block w-full rounded-card border p-3 text-left ${selected === r.path ? "border-brand-700" : "border-[var(--neutral-200)]"} bg-white`}>
            <div className="flex justify-between">
              <span className="text-xs uppercase text-[var(--neutral-500)]">{r.section}</span>
              <span className={`rounded px-2 text-xs ${bandStyle[r.band]}`}>{r.band}</span>
            </div>
            <div className="font-medium">{r.label}</div>
            <div className="text-sm text-[var(--neutral-700)]">{r.value}</div>
          </button>
        ))}
        {props.status === "AWAITING_REVIEW" && props.canApprove && (
          <div className="sticky bottom-0 space-y-2 rounded-card border border-[var(--neutral-200)] bg-white p-3">
            <p className="text-sm text-warning-700">{unresolved} item(s) need confirmation</p>
            <form action={approveAction}>
              <input type="hidden" name="reportId" value={props.reportId} />
              <button className="w-full rounded-control bg-success-700 py-2 text-white">Approve report</button>
            </form>
            <form action={requestChangesAction} className="flex gap-2">
              <input type="hidden" name="reportId" value={props.reportId} />
              <input name="reason" placeholder="Reason" className="flex-1 rounded-control border border-[var(--neutral-200)] px-2" />
              <button className="rounded-control bg-warning-700 px-3 text-white">Request changes</button>
            </form>
          </div>
        )}
        {props.status === "APPROVED" && props.canIssue && (
          <form action={issueAction}>
            <input type="hidden" name="reportId" value={props.reportId} />
            <button className="w-full rounded-control bg-brand-900 py-2 text-white">Issue PDF</button>
          </form>
        )}
        {props.status === "ISSUED" && (
          <a href={`/api/reports/${props.reportId}/pdf`} className="block rounded-control bg-brand-700 py-2 text-center text-white">
            Download issued PDF
          </a>
        )}
      </section>
      <aside className="space-y-3">
        <h2 className="font-semibold text-brand-900">Evidence</h2>
        <p className="text-xs text-[var(--neutral-500)]">{props.photoCount} photo(s)</p>
        <div className="rounded-card border border-[var(--neutral-200)] bg-white p-3 text-sm">
          <div className="mb-1 font-semibold">Transcript</div>
          <p className="whitespace-pre-wrap text-[var(--neutral-700)]">{props.transcript || "No transcript"}</p>
        </div>
      </aside>
    </main>
  );
}
