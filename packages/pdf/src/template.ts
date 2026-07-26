import type { ConfidenceBand, DprStructuredData } from "@buildflow/domain/dpr/schema";

// All interpolated values pass through esc(): transcript-derived text is untrusted input
// to this HTML pipeline (rules.md §13 "sanitize rendered HTML").
const esc = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export type PdfPhoto = {
  dataUri: string;        // pre-encoded data: URI (server-side, from verified storage only)
  capturedAt?: string | null;
  caption?: string | null;
};

/**
 * "client" is the issued, shareable document. "internal" is the same approved revision
 * rendered for the project team: it adds the internal summary, the confidence band of
 * every item and the verified transcript quotes behind them. A client document never
 * carries any of that (design.md §17: no unapproved internal notes in a client-safe
 * report).
 */
export type DocumentVariant = "client" | "internal";

/**
 * A number the document may print, with its provenance. `value === null` prints an em
 * dash: an unknown quantity is stated as unknown, never interpolated (rules.md §11).
 * `basis` explains where the number came from, or why there isn't one.
 */
export type ReportFigure = {
  value: string | null;
  unit: string | null;
  basis: string | null;
};

/** One linked schedule activity: today vs cumulative vs planned, all from stored rows. */
export type ActivityProgressRow = {
  scheduleItemId: string;
  name: string;
  activityName: string | null;
  /** Baseline start → end from the schedule item, when both dates are stored. */
  baselineWindow: string | null;
  planned: ReportFigure;
  today: ReportFigure;
  cumulative: ReportFigure;
  certified: ReportFigure;
  /** Manually entered percent, or null when no progress update has ever been recorded. */
  progressPercent: number | null;
  progressBasis: string | null;
};

/** A first-class tracked blocker, open on the project as at the report date. */
export type TrackedBlockerRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  owner: string | null;
  dueDate: string | null;
  ageDays: number | null;
  overdue: boolean;
};

export type ProductivityUnitRow = {
  unit: string | null;
  quantity: string;
  perHead: string;
  /** The arithmetic, spelled out: "12.5 cum ÷ 10 = 1.25 cum per head". */
  formula: string;
};

export type ProductivityBlock = {
  date: string;
  headcount: number | null;
  headcountBasis: string | null;
  rows: ProductivityUnitRow[];
  /** Non-null when a side is missing — the document says so instead of printing a ratio. */
  unavailableReason: string | null;
};

export type DprPdfInput = {
  documentId: string;
  version: number;
  reportDate: string;
  data: DprStructuredData;
  summaryClientSafe: string;
  issuedBy: string;
  photos?: PdfPhoto[];
  /** Per-project sequential DPR number — how sites reference a report in correspondence. */
  dprNumber?: number | null;
  organizationName?: string | null;
  projectName?: string | null;
  clientName?: string | null;
  siteAddress?: string | null;
  /** Names for the signature block; ids are a poor substitute on a signed document. */
  submittedBy?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  /** True once a newer version supersedes this one (design.md §17). */
  superseded?: boolean;
  /** Defaults to "client" so existing callers keep producing the client-safe document. */
  variant?: DocumentVariant;
  /** Internal variant only. Ignored — and never rendered — for the client variant. */
  summaryInternal?: string | null;
  /** Tier-2 reporting depth; omit or leave empty and the section explains it is absent. */
  activityProgress?: ActivityProgressRow[];
  trackedBlockers?: TrackedBlockerRow[];
  productivity?: ProductivityBlock | null;
};

const DASH = "—";

/** Items the reviewer did not fully confirm are marked in the document, not hidden. */
const bandMark = (band: ConfidenceBand): string =>
  band === "Supported" ? "" : `<span class="flag flag--${band.toLowerCase()}">${esc(band)}</span>`;

const cell = (value: string | number | null | undefined): string =>
  value === null || value === undefined || value === "" ? DASH : esc(String(value));

function table(
  caption: string,
  headers: string[],
  rows: string[][],
  emptyNote = "Nothing reported.",
): string {
  const head = headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("");
  if (rows.length === 0) {
    return `<section class="block"><h2>${esc(caption)}</h2><p class="empty">${esc(emptyNote)}</p></section>`;
  }
  // <thead> repeats automatically on every printed page; rows never split mid-row.
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  return `<section class="block"><h2>${esc(caption)}</h2>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
}

/** A figure prints as "value unit", or as an em dash when nothing stored supports it. */
const fig = (f: ReportFigure): string =>
  f.value === null ? DASH : `${esc(f.value)}${f.unit ? ` ${esc(f.unit)}` : ""}`;

// --- Tier 2: today vs cumulative vs planned, per linked schedule activity ---

function progressSection(rows: ActivityProgressRow[]): string {
  if (rows.length === 0) {
    return `<section class="block"><h2>Progress against schedule</h2>
      <p class="empty">This report is not linked to any schedule activity.</p></section>`;
  }
  const body = rows.map((r) => `<tr>
      <td>${cell(r.name)}${r.activityName ? `<br /><small>${esc(r.activityName)}</small>` : ""}</td>
      <td>${cell(r.baselineWindow)}</td>
      <td class="num">${fig(r.planned)}</td>
      <td class="num">${fig(r.today)}</td>
      <td class="num">${fig(r.cumulative)}</td>
      <td class="num">${fig(r.certified)}</td>
      <td class="num">${r.progressPercent === null ? DASH : `${esc(String(r.progressPercent))}%`}</td>
    </tr>`).join("");
  // Every figure names the rows it was summed from, so a reader can re-derive it.
  const basis = rows.map((r) => {
    const lines = [
      r.planned.basis, r.today.basis, r.cumulative.basis, r.certified.basis, r.progressBasis,
    ].filter((b): b is string => Boolean(b));
    return lines.length === 0 ? "" : `<li><strong>${esc(r.name)}</strong> — ${esc(lines.join(" "))}</li>`;
  }).join("");
  return `<section class="block"><h2>Progress against schedule</h2>
    <table><thead><tr>
      <th scope="col">Activity</th><th scope="col">Baseline window</th>
      <th scope="col">Planned qty</th><th scope="col">Today</th>
      <th scope="col">Cumulative to date</th><th scope="col">Certified (MB)</th>
      <th scope="col">Progress</th>
    </tr></thead><tbody>${body}</tbody></table>
    ${basis ? `<ul class="basis">${basis}</ul>` : ""}</section>`;
}

// --- Tier 2: tracked blockers open on the project ---

function trackedBlockerSection(rows: TrackedBlockerRow[], asAt: string): string {
  const caption = "Blockers open on this project";
  if (rows.length === 0) {
    return `<section class="block"><h2>${esc(caption)}</h2>
      <p class="empty">No tracked blocker was open as at ${esc(asAt)}.</p></section>`;
  }
  // Kept in one break-inside:avoid section so the table never separates from the note
  // explaining what "open" and "age" mean on this document.
  const body = rows.map((b) => `<tr>
      <td>${cell(b.title)}</td><td>${cell(b.severity)}</td><td>${cell(b.status)}</td>
      <td>${cell(b.owner)}</td>
      <td>${cell(b.dueDate)}${b.overdue ? ` <span class="flag flag--check">OVERDUE</span>` : ""}</td>
      <td class="num">${b.ageDays === null ? DASH : esc(String(b.ageDays))}</td>
    </tr>`).join("");
  return `<section class="block"><h2>${esc(caption)}</h2>
    <table><thead><tr>
      <th scope="col">Blocker</th><th scope="col">Severity</th><th scope="col">Status</th>
      <th scope="col">Owner</th><th scope="col">Due</th><th scope="col">Age (days)</th>
    </tr></thead><tbody>${body}</tbody></table>
    <p class="notice notice--tight">Tracked project records that were open as at
    ${esc(asAt)}, separate from the blockers reported in this update. Age counts days from
    when the blocker was raised.</p></section>`;
}

// --- Tier 2: labour productivity for the report date ---

function productivitySection(p: ProductivityBlock): string {
  const head = `<h2>Labour productivity (${esc(p.date)})</h2>`;
  const headcountLine = `<p class="meta-line">Attendance headcount:
    <strong>${p.headcount === null ? DASH : esc(String(p.headcount))}</strong>
    ${p.headcountBasis ? `<small>${esc(p.headcountBasis)}</small>` : ""}</p>`;
  if (p.unavailableReason) {
    // One side missing means no ratio at all: a misleading number is worse than a gap.
    return `<section class="block">${head}${headcountLine}
      <p class="empty">${esc(p.unavailableReason)}</p></section>`;
  }
  const body = p.rows.map((r) => `<tr>
      <td class="num">${esc(r.quantity)}</td><td>${cell(r.unit)}</td>
      <td class="num">${esc(r.perHead)}</td><td><small>${esc(r.formula)}</small></td>
    </tr>`).join("");
  return `<section class="block">${head}${headcountLine}
    <table><thead><tr>
      <th scope="col">Approved quantity</th><th scope="col">Unit</th>
      <th scope="col">Per head</th><th scope="col">Calculation</th>
    </tr></thead><tbody>${body}</tbody></table>
    <p class="notice notice--tight">Approved work quantities for ${esc(p.date)} divided by
    the attendance headcount recorded for the same date. This is arithmetic on stored
    records, not a performance rating.</p></section>`;
}

// --- Internal variant: confidence and the words behind each item ---

type FlatItem = { section: string; label: string; value: string; band: ConfidenceBand; quotes: string[] };

/** Flattens the approved revision into reviewable items, mirroring the review screen. */
function flattenItems(d: DprStructuredData): FlatItem[] {
  const quotes = (refs: { quote?: string }[]) =>
    refs.map((r) => r.quote).filter((q): q is string => Boolean(q));
  const items: FlatItem[] = [];
  d.work_items.forEach((w) => items.push({
    section: "Work items", label: w.description,
    value: [w.quantity.value && `${w.quantity.value} ${w.quantity.unit ?? ""}`.trim(), w.location]
      .filter(Boolean).join(" · ") || DASH,
    band: w.confidence_band, quotes: quotes(w.source_refs),
  }));
  d.labour.forEach((l) => items.push({
    section: "Labour", label: l.trade, value: l.count === null ? "count unknown" : String(l.count),
    band: l.confidence_band, quotes: quotes(l.source_refs),
  }));
  d.materials.forEach((m) => items.push({
    section: "Materials", label: m.name, value: m.status ?? DASH,
    band: m.confidence_band, quotes: quotes(m.source_refs),
  }));
  d.equipment.forEach((e) => items.push({
    section: "Equipment", label: e.name, value: e.status ?? DASH,
    band: e.confidence_band, quotes: quotes(e.source_refs),
  }));
  d.safety_quality.forEach((s) => items.push({
    section: "Safety and quality", label: s.note, value: "observation",
    band: s.confidence_band, quotes: quotes(s.source_refs),
  }));
  d.blockers.forEach((b) => items.push({
    section: "Blockers", label: b.description, value: b.owner ?? "no owner",
    band: b.confidence_band, quotes: quotes(b.source_refs),
  }));
  items.push({
    section: "Weather / site condition", label: "Site condition",
    value: d.weather_site_condition.value ?? "Not mentioned",
    band: d.weather_site_condition.confidence_band,
    quotes: quotes(d.weather_site_condition.source_refs),
  });
  d.tomorrow_plan.forEach((t) => items.push({
    section: "Tomorrow's plan", label: t.item, value: DASH,
    band: t.confidence_band, quotes: quotes(t.source_refs),
  }));
  return items;
}

/**
 * Internal appendix: every item with its confidence band called out and the verified
 * transcript quotes behind it. Only quotes that were checked against the transcript
 * survive extraction, so anything printed here really occurs in the recording.
 */
function internalEvidenceSection(data: DprStructuredData): string {
  const items = flattenItems(data);
  const unconfirmed = items.filter((i) => i.band !== "Supported");
  const sections = [...new Set(items.map((i) => i.section))];
  const blocks = sections.map((section) => {
    const rows = items.filter((i) => i.section === section).map((i) => `<li>
        <strong>${esc(i.label)}</strong> <span class="muted">${esc(i.value)}</span>
        <span class="flag flag--${i.band.toLowerCase()}">${esc(i.band)}</span>
        ${i.quotes.length > 0
          ? i.quotes.map((q) => `<blockquote>&ldquo;${esc(q)}&rdquo;</blockquote>`).join("")
          : `<p class="empty">No verified words from the transcript support this item.</p>`}
      </li>`).join("");
    return `<div class="internal-group"><h3>${esc(section)}</h3><ul class="evidence-list">${rows}</ul></div>`;
  }).join("");
  return `<section class="block internal-block">
    <h2>Confidence and cited evidence (internal)</h2>
    <p class="meta-line">${unconfirmed.length === 0
      ? "Every item is Supported by verified words from the recording."
      : `${esc(String(unconfirmed.length))} of ${esc(String(items.length))} items are Check or Missing and were not fully confirmed.`}</p>
    ${blocks}</section>`;
}

function listBlock(caption: string, items: { text: string; band: ConfidenceBand }[]): string {
  if (items.length === 0) {
    return `<section class="block"><h2>${esc(caption)}</h2><p class="empty">Nothing reported.</p></section>`;
  }
  const li = items.map((i) => `<li>${esc(i.text)} ${bandMark(i.band)}</li>`).join("");
  return `<section class="block"><h2>${esc(caption)}</h2><ul>${li}</ul></section>`;
}

export function dprHtml(input: DprPdfInput): string {
  const { data } = input;
  // Default "client": an omitted variant must never widen what a document discloses.
  const isInternal = input.variant === "internal";
  const labourTotal = data.labour.reduce((sum, l) => sum + (l.count ?? 0), 0);
  const anyUnconfirmed = [
    ...data.work_items, ...data.labour, ...data.materials, ...data.equipment,
    ...data.safety_quality, ...data.blockers, ...data.tomorrow_plan,
    data.weather_site_condition,
  ].some((item) => item.confidence_band !== "Supported");

  const identity = [input.projectName, input.clientName ? `Client: ${input.clientName}` : null]
    .filter(Boolean).join(" · ");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm 16mm 20mm; }
    * { box-sizing: border-box; }
    body { font-family: Inter, "Helvetica Neue", Arial, sans-serif; color: #111827; font-size: 10.5pt; margin: 0; }
    .masthead { display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 2px solid #102A43; padding-bottom: 8px; margin-bottom: 10px; }
    .masthead h1 { color: #102A43; font-size: 17pt; margin: 0 0 2px; letter-spacing: -0.01em; }
    .masthead .org { font-size: 9pt; color: #4B5563; }
    .serial { text-align: right; font-size: 9pt; color: #374151; line-height: 1.5; }
    .serial strong { display: block; font-size: 13pt; color: #102A43; }
    .metabar { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9pt; }
    .metabar td { border: 1px solid #E5E7EB; padding: 5px 8px; }
    .metabar td.k { background: #F3F4F6; color: #374151; font-weight: 600; width: 22%; }
    .summary { background: #F7F9FB; border-left: 0; border: 1px solid #DCEAF2; border-radius: 4px;
      padding: 10px 12px; margin-bottom: 14px; }
    .summary h2 { margin: 0 0 4px; }
    h2 { color: #1F4E6D; font-size: 10.5pt; margin: 0 0 6px; text-transform: uppercase;
      letter-spacing: 0.04em; }
    .block { margin-bottom: 14px; break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #E5E7EB; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #EFF3F7; color: #102A43; font-size: 8.5pt; text-transform: uppercase;
      letter-spacing: 0.03em; }
    tbody tr { break-inside: avoid; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td { font-weight: 700; background: #F9FAFB; }
    ul { margin: 0; padding-left: 16px; }
    li { margin-bottom: 3px; }
    .empty { color: #6B7280; font-style: italic; margin: 0; }
    .flag { display: inline-block; font-size: 7.5pt; font-weight: 700; padding: 1px 5px;
      border-radius: 3px; vertical-align: middle; }
    .flag--check { background: #FFF2C6; color: #7A5300; }
    .flag--missing { background: #F3F4F6; color: #4B5563; }
    .flag--supported { background: #DCF5E5; color: #14603A; }
    .notice { font-size: 8.5pt; color: #4B5563; border-top: 1px solid #E5E7EB;
      padding-top: 8px; margin-top: 4px; }
    .notice--tight { border-top: 0; padding-top: 4px; }
    .meta-line { font-size: 9pt; color: #374151; margin: 0 0 6px; }
    .meta-line small { color: #6B7280; margin-left: 6px; }
    .basis { font-size: 8.5pt; color: #4B5563; margin-top: 6px; }
    .muted { color: #6B7280; }
    .internal-band { background: #102A43; color: #FFFFFF; font-weight: 700; text-align: center;
      padding: 6px; border-radius: 4px; margin-bottom: 10px; letter-spacing: 0.06em; }
    .internal-block { break-before: page; }
    .internal-group { margin-bottom: 10px; break-inside: avoid; }
    .internal-group h3 { font-size: 9pt; color: #102A43; text-transform: uppercase;
      letter-spacing: 0.04em; margin: 0 0 4px; }
    .evidence-list li { margin-bottom: 6px; }
    .evidence-list blockquote { margin: 2px 0 0 0; padding-left: 8px; font-size: 9pt;
      color: #374151; border-left: 2px solid #DCEAF2; }
    .signatures { margin-top: 18px; break-inside: avoid; }
    .sigrow { display: flex; gap: 12px; }
    .sig { flex: 1; border: 1px solid #E5E7EB; border-radius: 4px; padding: 8px 10px; }
    .sig small { display: block; font-size: 8pt; color: #6B7280; text-transform: uppercase;
      letter-spacing: 0.04em; margin-bottom: 22px; }
    .sig .who { font-size: 9.5pt; font-weight: 600; border-top: 1px solid #9CA3AF; padding-top: 4px; }
    .sig .when { font-size: 8pt; color: #6B7280; }
    .superseded { background: #FEE4E2; color: #B42318; font-weight: 700; text-align: center;
      padding: 6px; border-radius: 4px; margin-bottom: 10px; letter-spacing: 0.06em; }
    .photo-page { break-before: page; }
    .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
    .photo-card { break-inside: avoid; }
    .photo-card img { width: 100%; max-height: 92mm; object-fit: contain; border: 1px solid #E5E7EB;
      border-radius: 3px; }
    .photo-card figcaption { font-size: 8pt; color: #6B7280; margin-top: 2mm; }
    figure { margin: 0; }
  </style></head><body>

    ${isInternal ? `<div class="internal-band">INTERNAL — not for client distribution</div>` : ""}

    ${input.superseded ? `<div class="superseded">SUPERSEDED — a later revision of this report exists</div>` : ""}

    <header class="masthead">
      <div>
        <h1>Daily Progress Report</h1>
        <div class="org">${cell(identity || input.organizationName)}</div>
      </div>
      <div class="serial">
        ${input.dprNumber ? `<strong>DPR No. ${esc(String(input.dprNumber))}</strong>` : ""}
        Revision ${esc(String(input.version))}
      </div>
    </header>

    <table class="metabar"><tbody>
      <tr>
        <td class="k">Report date</td><td>${cell(input.reportDate)}</td>
        <td class="k">Project</td><td>${cell(input.projectName)}</td>
      </tr>
      <tr>
        <td class="k">Site / address</td><td>${cell(input.siteAddress)}</td>
        <td class="k">Weather / site condition</td>
        <td>${cell(data.weather_site_condition.value)} ${bandMark(data.weather_site_condition.confidence_band)}</td>
      </tr>
      <tr>
        <td class="k">Document ID</td><td>${cell(input.documentId)}</td>
        <td class="k">Total labour on site</td><td>${labourTotal > 0 ? esc(String(labourTotal)) : DASH}</td>
      </tr>
    </tbody></table>

    ${input.summaryClientSafe ? `<section class="summary">
      <h2>Summary</h2><div>${esc(input.summaryClientSafe)}</div>
    </section>` : ""}

    ${isInternal && input.summaryInternal ? `<section class="summary">
      <h2>Internal summary</h2><div>${esc(input.summaryInternal)}</div>
    </section>` : ""}

    ${table("Work completed", ["Description", "Location", "Activity", "Quantity", "Unit"],
      data.work_items.map((w) => [
        `${esc(w.description)} ${bandMark(w.confidence_band)}`,
        cell(w.location), cell(w.activity),
        `<span class="num">${cell(w.quantity.value)}</span>`, cell(w.quantity.unit),
      ]))}

    ${data.labour.length > 0 ? `<section class="block"><h2>Labour deployed</h2>
      <table><thead><tr><th scope="col">Trade</th><th scope="col">Headcount</th></tr></thead>
      <tbody>${data.labour.map((l) =>
        `<tr><td>${esc(l.trade)} ${bandMark(l.confidence_band)}</td>
         <td class="num">${cell(l.count)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${esc(String(labourTotal))}</td></tr></tfoot>
      </table></section>`
      : table("Labour deployed", ["Trade", "Headcount"], [])}

    ${table("Materials", ["Material", "Status", "Quantity", "Unit"],
      data.materials.map((m) => [
        `${esc(m.name)} ${bandMark(m.confidence_band)}`,
        cell(m.status),
        `<span class="num">${cell(m.quantity?.value ?? null)}</span>`,
        cell(m.quantity?.unit ?? m.unit),
      ]))}

    ${table("Equipment", ["Equipment", "Status"],
      data.equipment.map((e) => [
        `${esc(e.name)} ${bandMark(e.confidence_band)}`, cell(e.status),
      ]))}

    ${listBlock("Safety and quality observations",
      data.safety_quality.map((s) => ({ text: s.note, band: s.confidence_band })))}

    ${progressSection(input.activityProgress ?? [])}

    ${input.productivity ? productivitySection(input.productivity) : ""}

    ${table("Blockers reported in this update", ["Blocker", "Cause", "Owner", "Expected resolution"],
      data.blockers.map((b) => [
        `${esc(b.description)} ${bandMark(b.confidence_band)}`,
        cell(b.cause), cell(b.owner), cell(b.expected_resolution),
      ]), "No blockers reported in this update.")}

    ${trackedBlockerSection(input.trackedBlockers ?? [], input.reportDate)}

    ${listBlock("Tomorrow's plan",
      data.tomorrow_plan.map((t) => ({ text: t.item, band: t.confidence_band })))}

    <section class="signatures">
      <h2>Approval</h2>
      <div class="sigrow">
        <div class="sig">
          <small>Submitted by (site)</small>
          <div class="who">${cell(input.submittedBy)}</div>
        </div>
        <div class="sig">
          <small>Approved by (project manager)</small>
          <div class="who">${cell(input.approvedBy ?? input.issuedBy)}</div>
          <div class="when">${input.approvedAt ? esc(input.approvedAt) : ""}</div>
        </div>
        <div class="sig">
          <small>Client / consultant representative</small>
          <div class="who">&nbsp;</div>
          <div class="when">Signature &amp; date</div>
        </div>
      </div>
    </section>

    <p class="notice">
      ${anyUnconfirmed
        ? "Items marked Check or Missing were not fully confirmed against the source recording and remain subject to correction. "
        : ""}Prepared from the site team's recorded update and reviewed before issue.
      Corrections are issued as a new revision; earlier revisions are retained and marked superseded.
      An em dash means no stored record carries that value; nothing on this page is estimated.
      ${isInternal ? "This internal copy adds review detail and is not for client distribution." : ""}
    </p>

    ${isInternal ? internalEvidenceSection(data) : ""}

    ${photoPages(input.photos ?? [])}
  </body></html>`;
}

function photoPages(photos: PdfPhoto[]): string {
  if (photos.length === 0) return "";
  const cards = photos.map((photo, index) => `<figure class="photo-card">
      <img src="${photo.dataUri}" alt="Site photo ${index + 1}" />
      <figcaption>${esc([`Photo ${index + 1}`, photo.caption ?? "", photo.capturedAt ? `captured ${photo.capturedAt}` : ""].filter(Boolean).join(" · "))}</figcaption>
    </figure>`).join("");
  return `<section class="photo-page"><h2>Site photo evidence (${photos.length})</h2><div class="photo-grid">${cards}</div></section>`;
}
