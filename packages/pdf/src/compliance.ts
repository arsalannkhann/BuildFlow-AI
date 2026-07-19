import { chromium } from "playwright";

export const COMPLIANCE_COVER_TEMPLATE_VERSION = "compliance-cover.v1";

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

export async function renderComplianceCoverPdf(input: {
  packId: string; title: string; projectName: string; kindLabel: string;
  periodStart: string; periodEnd: string; version: number; exportedAt: string;
  status: "DRAFT" | "REVIEWED"; reviewerName?: string | null; reviewedAt?: string | null;
  requirements: { total: number; satisfied: number; notApplicable: number; pending: number };
  legalCaution: string;
}): Promise<Uint8Array> {
  const watermark = input.status === "DRAFT" ? '<div class="watermark">DRAFT</div>' : "";
  const review = input.status === "REVIEWED"
    ? `<p><strong>Human review:</strong> ${escapeHtml(input.reviewerName ?? "Recorded reviewer")} · ${escapeHtml(input.reviewedAt ?? "date recorded in manifest")}</p>`
    : "<p><strong>Human review:</strong> Not completed. This export is a draft evidence pack.</p>";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:A4;margin:20mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#102a43;margin:0}
    .bar{height:8px;background:#f26a21;margin-bottom:34px}.watermark{position:fixed;top:42%;left:10%;font-size:110px;font-weight:800;color:rgba(180,35,24,.10);transform:rotate(-22deg)}
    h1{font-size:34px;line-height:1.1;margin:10px 0}h2{font-size:16px;color:#52606d;margin:0 0 30px}.status{display:inline-block;padding:8px 12px;border:2px solid ${input.status === "DRAFT" ? "#b42318" : "#16794b"};color:${input.status === "DRAFT" ? "#b42318" : "#16794b"};font-weight:800;letter-spacing:.08em}
    .meta{margin:34px 0;border-top:1px solid #d9e2ec}.row{display:grid;grid-template-columns:150px 1fr;padding:12px 0;border-bottom:1px solid #d9e2ec}.row b{color:#52606d}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:28px 0}.summary div{border:1px solid #d9e2ec;padding:12px}.summary strong{display:block;font-size:24px}.note{margin-top:40px;padding:14px;border-left:4px solid #f26a21;background:#f5f7fa;font-size:12px;line-height:1.5;color:#52606d}p{line-height:1.5}
  </style></head><body>${watermark}<div class="bar"></div><span class="status">${input.status}</span>
    <h1>${escapeHtml(input.title)}</h1><h2>${escapeHtml(input.kindLabel)} · Version ${input.version}</h2>
    <div class="meta"><div class="row"><b>Project</b><span>${escapeHtml(input.projectName)}</span></div>
    <div class="row"><b>Period</b><span>${escapeHtml(input.periodStart)} to ${escapeHtml(input.periodEnd)}</span></div>
    <div class="row"><b>Pack ID</b><span>${escapeHtml(input.packId)}</span></div>
    <div class="row"><b>Exported</b><span>${escapeHtml(input.exportedAt)}</span></div></div>
    <div class="summary"><div><strong>${input.requirements.total}</strong>Total</div><div><strong>${input.requirements.satisfied}</strong>Satisfied</div><div><strong>${input.requirements.notApplicable}</strong>N/A</div><div><strong>${input.requirements.pending}</strong>Pending</div></div>
    ${review}<div class="note"><strong>Important:</strong> ${escapeHtml(input.legalCaution)}</div>
  </body></html>`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
