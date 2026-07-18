import { chromium } from "playwright";
import { dprHtml, type PdfPhoto } from "./template";
import type { DprStructuredData } from "@buildflow/domain/dpr/schema";

// v2 adds photo evidence pages. Historical PDFs keep the template version they were
// issued with (rules.md §13).
export const TEMPLATE_VERSION = "dpr-pdf.v2";

export async function renderDprPdf(input: {
  documentId: string; version: number; reportDate: string;
  data: DprStructuredData; summaryClientSafe: string; issuedBy: string;
  photos?: PdfPhoto[];
}): Promise<Uint8Array> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(dprHtml(input), { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
