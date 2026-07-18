import type { DprStructuredData } from "@buildflow/domain/dpr/schema";

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

export function dprHtml(input: {
  documentId: string; version: number; reportDate: string;
  data: DprStructuredData; summaryClientSafe: string; issuedBy: string;
  photos?: PdfPhoto[];
}): string {
  const { data } = input;
  const rows = (label: string, items: string[]) =>
    items.length ? `<h2>${esc(label)}</h2><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 20mm; }
    body { font-family: Inter, sans-serif; color: #111827; }
    h1 { color: #102A43; } h2 { color: #1F4E6D; font-size: 14px; margin-top: 16px; }
    .meta { color: #6B7280; font-size: 12px; }
    ul { padding-left: 18px; }
    .photo-page { page-break-before: always; }
    .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
    .photo-card { break-inside: avoid; }
    .photo-card img { width: 100%; max-height: 95mm; object-fit: contain; border: 1px solid #E5E7EB; border-radius: 4px; }
    .photo-card figcaption { font-size: 10px; color: #6B7280; margin-top: 2mm; }
    figure { margin: 0; }
  </style></head><body>
    <h1>Daily Progress Report</h1>
    <p class="meta">Date: ${esc(input.reportDate)} · Document ${esc(input.documentId)} · v${input.version} · Issued by ${esc(input.issuedBy)}</p>
    <p>${esc(input.summaryClientSafe)}</p>
    ${rows("Work completed", data.work_items.map((w) => `${w.description}${w.quantity.value ? ` — ${w.quantity.value} ${w.quantity.unit ?? ""}` : ""}`))}
    ${rows("Labour", data.labour.map((l) => `${l.trade}: ${l.count ?? "—"}`))}
    ${rows("Materials", data.materials.map((m) => `${m.name} (${m.status ?? "—"})`))}
    ${rows("Blockers", data.blockers.map((b) => b.description))}
    ${rows("Tomorrow's plan", data.tomorrow_plan.map((t) => t.item))}
    <p class="meta">Estimates and unverified statements are marked in the internal record.</p>
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
