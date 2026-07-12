import type { DprStructuredData } from "@/domain/dpr/schema";

export function dprHtml(input: {
  documentId: string; version: number; reportDate: string;
  data: DprStructuredData; summaryClientSafe: string; issuedBy: string;
}): string {
  const { data } = input;
  const rows = (label: string, items: string[]) =>
    items.length ? `<h2>${label}</h2><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 20mm; }
    body { font-family: Inter, sans-serif; color: #111827; }
    h1 { color: #102A43; } h2 { color: #1F4E6D; font-size: 14px; margin-top: 16px; }
    .meta { color: #6B7280; font-size: 12px; }
    ul { padding-left: 18px; }
  </style></head><body>
    <h1>Daily Progress Report</h1>
    <p class="meta">Date: ${input.reportDate} · Document ${input.documentId} · v${input.version} · Issued by ${input.issuedBy}</p>
    <p>${input.summaryClientSafe}</p>
    ${rows("Work completed", data.work_items.map((w) => `${w.description}${w.quantity.value ? ` — ${w.quantity.value} ${w.quantity.unit ?? ""}` : ""}`))}
    ${rows("Labour", data.labour.map((l) => `${l.trade}: ${l.count ?? "—"}`))}
    ${rows("Materials", data.materials.map((m) => `${m.name} (${m.status ?? "—"})`))}
    ${rows("Blockers", data.blockers.map((b) => b.description))}
    ${rows("Tomorrow's plan", data.tomorrow_plan.map((t) => t.item))}
    <p class="meta">Estimates and unverified statements are marked in the internal record.</p>
  </body></html>`;
}
