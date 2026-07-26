import { dprHtml, type DprPdfInput } from "./template";
export type {
  PdfPhoto, DprPdfInput, DocumentVariant, ReportFigure, ActivityProgressRow,
  TrackedBlockerRow, ProductivityUnitRow, ProductivityBlock,
} from "./template";

// v4 adds Tier-2 reporting depth: today vs cumulative vs planned per linked schedule
// activity, certified measurement to date, tracked project blockers separated from the
// blockers reported in this update, labour productivity with its formula shown, and an
// internal variant carrying the internal summary, confidence bands and verified quotes.
// (v3 was the rebuild that stopped silently dropping weather, safety/quality and
// equipment.) Historical PDFs keep the template version they were issued with, which is
// why issued_document.template_version is stored per document and never back-filled
// (rules.md §13).
export const TEMPLATE_VERSION = "dpr-pdf.v4";

export async function renderDprPdf(input: DprPdfInput): Promise<Uint8Array> {
  // Loaded on demand, not at module scope: importing this module (e.g. from a page that only
  // needs the HTML template or the TEMPLATE_VERSION) must not require playwright, which is a
  // heavy server-external dependency present only where PDFs are actually rendered. Importing
  // it eagerly crashed any page whose graph touched this file with "Cannot find module
  // 'playwright'".
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(dprHtml(input), { waitUntil: "load" });
    // Chromium ignores CSS paged-media margin boxes, so page numbering and the document
    // footer come from Playwright's header/footer templates instead.
    const footer = `<div style="width:100%;padding:0 16mm;font:8pt Inter,Arial,sans-serif;
        color:#6B7280;display:flex;justify-content:space-between;">
        <span>${input.variant === "internal" ? "INTERNAL COPY · " : ""}${input.dprNumber ? `DPR No. ${input.dprNumber} · ` : ""}${input.reportDate} · rev ${input.version}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`;
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: footer,
      margin: { top: "18mm", bottom: "20mm", left: "0", right: "0" },
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
