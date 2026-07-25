"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { unresolvedCount, type FieldRow } from "../view-model";
import {
  approveAction, requestChangesAction, issueAction, retryProcessingAction,
  manualDraftAction, createClientLinkAction, revokeClientLinkAction,
} from "@/app/actions/review";
import { StatusBadge } from "@/app/components/StatusBadge";
import { FieldDecisionPanel } from "./FieldDecisionPanel";
import { formatProjectDate } from "@buildflow/domain/date-time";

const bandStyle: Record<string, string> = {
  Supported: "review-band review-band--supported",
  Check: "review-band review-band--check",
  Missing: "review-band review-band--missing",
};

const sectionNumbers: Record<string, string> = {
  "Work items": "01",
  Labour: "02",
  Materials: "03",
  Blockers: "04",
  Weather: "05",
  Tomorrow: "06",
};

export function ReviewClient(props: {
  reportId: string;
  reportDate: string;
  projectName: string;
  projectTimezone: string;
  status: string;
  rows: FieldRow[];
  transcript: string;
  canApprove: boolean;
  canIssue: boolean;
  canReview: boolean;
  photoCount: number;
  clientLinkToken?: string | null;
  activeClientLinks?: { id: string; expiresAt: string }[];
}) {
  const [selected, setSelected] = useState<string | null>(
    props.rows.find((row) => row.band !== "Supported")?.path ?? props.rows[0]?.path ?? null,
  );
  const unresolved = unresolvedCount(props.rows);
  const selectedRow = props.rows.find((row) => row.path === selected) ?? null;
  const groupedRows = useMemo(() => {
    const groups = new Map<string, FieldRow[]>();
    props.rows.forEach((row) => {
      groups.set(row.section, [...(groups.get(row.section) ?? []), row]);
    });
    return Array.from(groups.entries());
  }, [props.rows]);
  const reportDate = formatProjectDate(props.reportDate, {
    timeZone: props.projectTimezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main id="main-content" className="page-shell review-page">
      <div className="review-breadcrumb">
        <Link href="/reports">Reports</Link>
        <span aria-hidden="true">/</span>
        <span>{props.reportDate}</span>
      </div>

      <section className="review-title-row">
        <div>
          <p className="eyebrow">Daily Progress Report</p>
          <h1 className="page-title">Review before it becomes record.</h1>
          <p className="page-lead">{reportDate} · {props.projectName}</p>
        </div>
        <div className="review-document-meta">
          <small>REPORT STATUS</small>
          <StatusBadge status={props.status} showCode />
          <span>BF · {props.reportId.slice(0, 8).toUpperCase()}</span>
        </div>
      </section>

      <section className="review-summary-strip" aria-label="Review summary">
        <div className="review-summary-strip__intro">
          <span className="ai-draft-mark" aria-hidden="true">AI</span>
          <div>
            <strong>Drafted from the submitted evidence</strong>
            <p>BuildFlow structured the voice update. The manager remains responsible for approval.</p>
          </div>
        </div>
        <div className="review-summary-stat">
          <strong>{props.rows.length}</strong>
          <span>Extracted fields</span>
        </div>
        <div className={`review-summary-stat ${unresolved ? "review-summary-stat--warning" : ""}`}>
          <strong>{unresolved}</strong>
          <span>Need confirmation</span>
        </div>
        <div className="review-summary-stat">
          <strong>{props.photoCount}</strong>
          <span>Site photos</span>
        </div>
      </section>

      <div className="review-workspace">
        <section className="review-document">
          <div className="review-document__header">
            <div>
              <p className="eyebrow">Structured DPR</p>
              <h2 className="section-heading">Today&apos;s site record</h2>
            </div>
            <span>Select a field to inspect its evidence</span>
          </div>

          {groupedRows.length > 0 ? (
            <div className="review-sections">
              {groupedRows.map(([section, rows]) => (
                <section key={section} className="review-section">
                  <div className="review-section__heading">
                    <span>{sectionNumbers[section] ?? "—"}</span>
                    <h3>{section}</h3>
                    <small>{rows.length} {rows.length === 1 ? "item" : "items"}</small>
                  </div>
                  <div className="review-field-list">
                    {rows.map((row) => (
                      <button
                        type="button"
                        key={row.path}
                        onClick={() => setSelected(row.path)}
                        className={`review-field ${selected === row.path ? "review-field--selected" : ""}`}
                        aria-pressed={selected === row.path}
                      >
                        <span className="review-field__copy">
                          <strong>{row.label}</strong>
                          <small>{row.value}</small>
                        </span>
                        <span className={bandStyle[row.band] ?? bandStyle.Missing}>
                          <span aria-hidden="true" />
                          {row.band}
                        </span>
                        <span className="review-field__chevron" aria-hidden="true">→</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="review-empty">
              <h3>No structured fields available</h3>
              <p>Use the transcript to prepare the report manually.</p>
            </div>
          )}
        </section>

        <aside className="evidence-panel">
          <div className="evidence-panel__heading">
            <div>
              <p className="eyebrow">Source evidence</p>
              <h2 className="section-heading">Why BuildFlow suggested this</h2>
            </div>
            <span>{props.photoCount} photos</span>
          </div>

          {selectedRow && (
            <div className="selected-evidence">
              <small>SELECTED FIELD</small>
              <strong>{selectedRow.label}</strong>
              <p>{selectedRow.value}</p>
              <div>
                <span className={bandStyle[selectedRow.band] ?? bandStyle.Missing}>
                  <span aria-hidden="true" />
                  {selectedRow.band}
                </span>
                <em>{selectedRow.refs.length} source {selectedRow.refs.length === 1 ? "reference" : "references"}</em>
              </div>
              {(() => {
                // Only verified quotes survive extraction (fabricated citations are stripped
                // server-side), so anything shown here really occurs in the transcript.
                const quotes = selectedRow.refs
                  .map((ref) => ref.quote)
                  .filter((quote): quote is string => Boolean(quote));
                if (quotes.length > 0) {
                  return (
                    <div className="cited-words">
                      <small>CITED WORDS FROM THE RECORDING</small>
                      {quotes.map((quote, index) => (
                        <blockquote key={index}>&ldquo;{quote}&rdquo;</blockquote>
                      ))}
                    </div>
                  );
                }
                return (
                  <p className="cited-words cited-words--none">
                    No verified words from the transcript support this item. Confirm it against
                    the recording before approving.
                  </p>
                );
              })()}
              {props.status === "AWAITING_REVIEW" && props.canReview && (
                <FieldDecisionPanel reportId={props.reportId} row={selectedRow} />
              )}
            </div>
          )}

          <div className="transcript-card">
            <div className="transcript-card__topline">
              <span className="audio-symbol" aria-hidden="true">
                {Array.from({ length: 7 }, (_, index) => <i key={index} />)}
              </span>
              <div>
                <strong>Original voice transcript</strong>
                <small>Submitted by Site Engineer</small>
              </div>
              <em>Source</em>
            </div>
            <blockquote>
              {props.transcript || "No transcript is available for this report."}
            </blockquote>
          </div>

          <div className="evidence-photo-placeholder">
            <div className="evidence-photo-placeholder__grid" aria-hidden="true">
              {Array.from({ length: Math.min(Math.max(props.photoCount, 2), 4) }, (_, index) => (
                <span key={index}><i /></span>
              ))}
            </div>
            <p>
              {props.photoCount
                ? `${props.photoCount} photo${props.photoCount === 1 ? "" : "s"} attached to this report`
                : "No photos were attached to this report"}
            </p>
          </div>

          <div className="evidence-note">
            <span aria-hidden="true">i</span>
            <p>AI suggestions are not approved facts. Check the source before issuing the DPR.</p>
          </div>
        </aside>
      </div>

      {props.status === "AWAITING_REVIEW" && props.canApprove && (
        <section className="review-action-dock">
          <div>
            <strong>{unresolved ? `${unresolved} items still need confirmation` : "All fields are supported"}</strong>
            <small>Approval creates an auditable record. Issuing the PDF happens separately.</small>
          </div>
          <div className="review-action-dock__actions">
            <form action={requestChangesAction} className="request-change-form">
              <input type="hidden" name="reportId" value={props.reportId} />
              <label className="sr-only" htmlFor="change-reason">Reason for changes</label>
              <input
                id="change-reason"
                name="reason"
                placeholder="Tell the engineer what to change"
                className="text-field"
              />
              <button className="secondary-button">Request changes</button>
            </form>
            <form action={approveAction}>
              <input type="hidden" name="reportId" value={props.reportId} />
              <button className="success-button">Approve report</button>
            </form>
          </div>
        </section>
      )}

      {props.status === "APPROVED" && props.canIssue && (
        <section className="review-action-dock review-action-dock--approved">
          <div>
            <strong>Approved and ready to issue</strong>
            <small>The PDF will be versioned and stored as an immutable project record.</small>
          </div>
          <form action={issueAction}>
            <input type="hidden" name="reportId" value={props.reportId} />
            <button className="primary-button">Issue PDF</button>
          </form>
        </section>
      )}

      {props.status === "PROCESSING_FAILED" && props.canReview && (
        <section className="review-action-dock review-action-dock--failed">
          <div>
            <strong>Couldn&apos;t finish processing</strong>
            <small>The audio and photos are safe. Retry the AI draft, or prepare the report manually.</small>
          </div>
          <div className="review-action-dock__actions">
            <form action={retryProcessingAction}>
              <input type="hidden" name="reportId" value={props.reportId} />
              <button className="primary-button">Retry processing</button>
            </form>
            <form action={manualDraftAction}>
              <input type="hidden" name="reportId" value={props.reportId} />
              <button className="secondary-button">Prepare manually</button>
            </form>
          </div>
        </section>
      )}

      {props.status === "ISSUED" && (
        <section className="review-action-dock review-action-dock--issued">
          <div>
            <strong>Report issued successfully</strong>
            <small>This version is now part of the project record.</small>
          </div>
          <a href={`/api/reports/${props.reportId}/pdf`} className="primary-button">
            Download issued PDF
          </a>
        </section>
      )}

      {(props.status === "ISSUED" || props.status === "SUPERSEDED") && props.canIssue && (
        <section className="surface-card admin-section" aria-labelledby="client-share">
          <h2 id="client-share">Client sharing</h2>
          {props.clientLinkToken && (
            <div className="admin-invite-notice">
              <p>Secure client link created — shown once, expires in 30 days:</p>
              <code className="admin-invite-notice__link">
                {typeof window === "undefined" ? "" : `${window.location.origin}/r/${props.clientLinkToken}`}
              </code>
            </div>
          )}
          {(props.activeClientLinks ?? []).map((link) => (
            <form key={link.id} action={revokeClientLinkAction} className="admin-inline-form">
              <span>Active link · expires {formatProjectDate(link.expiresAt, { timeZone: props.projectTimezone })}</span>
              <input type="hidden" name="reportId" value={props.reportId} />
              <input type="hidden" name="linkId" value={link.id} />
              <button type="submit" className="secondary-button">Revoke</button>
            </form>
          ))}
          <form action={createClientLinkAction}>
            <input type="hidden" name="reportId" value={props.reportId} />
            <button type="submit" className="secondary-button">Create client link</button>
          </form>
          <small>Clients see only the client-safe summary and the issued PDF — never internal notes or drafts.</small>
        </section>
      )}
    </main>
  );
}
