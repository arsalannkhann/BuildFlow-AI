import type { Capability } from "@buildflow/domain/tenancy";

// Phase E notification event catalog (docs/PHASE-E-DESIGN.md). Recipients are project
// members holding the capability relevant to the event; channel defaults are in-app on
// for everything, email on for review requests / rejections / failures, WhatsApp off
// until a person enables it on /account.

export const NOTIFY_CHANNELS = ["inapp", "email", "whatsapp"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

export type NotificationEventSpec = {
  /** Members holding this capability (org-wide or on the event's project) are notified. */
  capability: Capability;
  /** Email enabled by default (overridable per user on /account). */
  emailDefault: boolean;
  label: string;
};

export const NOTIFICATION_EVENTS = {
  "report.awaiting_review": { capability: "report.review", emailDefault: true, label: "Report awaiting review" },
  "report.rejected": { capability: "report.create", emailDefault: true, label: "Report changes requested" },
  "report.approved": { capability: "report.create", emailDefault: false, label: "Report approved" },
  "report.processing_failed": { capability: "report.review", emailDefault: true, label: "Report processing failed" },
  "report.missing": { capability: "report.review", emailDefault: false, label: "Report missing at cutoff" },
  "blocker.raised": { capability: "blocker.manage", emailDefault: false, label: "Blocker raised" },
  "blocker.overdue": { capability: "blocker.manage", emailDefault: false, label: "Blocker overdue" },
  "material.shortage": { capability: "material.manage", emailDefault: false, label: "Material shortage" },
  "rfq.quote_requested": { capability: "procurement.manage", emailDefault: false, label: "RFQ quotes requested" },
  "po.awaiting_approval": { capability: "procurement.approve", emailDefault: true, label: "PO awaiting approval" },
  "invoice.awaiting_review": { capability: "invoice.review", emailDefault: true, label: "Invoice awaiting review" },
  "mb.awaiting_verification": { capability: "mb.verify", emailDefault: true, label: "MB entry awaiting verification" },
  "compliance.due_soon": { capability: "compliance.manage", emailDefault: false, label: "Compliance requirement due" },
} as const satisfies Record<string, NotificationEventSpec>;

export type NotificationEventKind = keyof typeof NOTIFICATION_EVENTS;

export const NOTIFICATION_EVENT_KINDS = Object.keys(NOTIFICATION_EVENTS) as NotificationEventKind[];

/** Default enablement per channel when the user has no stored preference row. */
export function defaultEnabled(eventKind: NotificationEventKind, channel: NotifyChannel): boolean {
  if (channel === "inapp") return true;
  if (channel === "email") return NOTIFICATION_EVENTS[eventKind].emailDefault;
  return false; // whatsapp: off until explicitly enabled
}
