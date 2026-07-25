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

function listBlock(caption: string, items: { text: string; band: ConfidenceBand }[]): string {
  if (items.length === 0) {
    return `<section class="block"><h2>${esc(caption)}</h2><p class="empty">Nothing reported.</p></section>`;
  }
  const li = items.map((i) => `<li>${esc(i.text)} ${bandMark(i.band)}</li>`).join("");
  return `<section class="block"><h2>${esc(caption)}</h2><ul>${li}</ul></section>`;
}

export function dprHtml(input: DprPdfInput): string {
  const { data } = input;
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
    .notice { font-size: 8.5pt; color: #4B5563; border-top: 1px solid #E5E7EB;
      padding-top: 8px; margin-top: 4px; }
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

    ${table("Blockers", ["Blocker", "Cause", "Owner", "Expected resolution"],
      data.blockers.map((b) => [
        `${esc(b.description)} ${bandMark(b.confidence_band)}`,
        cell(b.cause), cell(b.owner), cell(b.expected_resolution),
      ]), "No blockers reported.")}

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
    </p>

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
