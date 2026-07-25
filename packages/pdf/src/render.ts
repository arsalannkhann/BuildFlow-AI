import { chromium } from "playwright";
import { dprHtml, type DprPdfInput } from "./template";
export type { PdfPhoto, DprPdfInput } from "./template";

// v3 renders every dpr.v1 section (weather, safety/quality and equipment were previously
// extracted, reviewed and then silently dropped), moves quantities into tables with
// repeated headers, marks unconfirmed items, and adds page numbers plus a signature block.
// Historical PDFs keep the template version they were issued with (rules.md §13).
export const TEMPLATE_VERSION = "dpr-pdf.v3";

export async function renderDprPdf(input: DprPdfInput): Promise<Uint8Array> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(dprHtml(input), { waitUntil: "load" });
    // Chromium ignores CSS paged-media margin boxes, so page numbering and the document
    // footer come from Playwright's header/footer templates instead.
    const footer = `<div style="width:100%;padding:0 16mm;font:8pt Inter,Arial,sans-serif;
        color:#6B7280;display:flex;justify-content:space-between;">
        <span>${input.dprNumber ? `DPR No. ${input.dprNumber} · ` : ""}${input.reportDate} · rev ${input.version}</span>
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
