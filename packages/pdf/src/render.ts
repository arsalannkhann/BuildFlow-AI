import { chromium } from "playwright";
import { dprHtml } from "./template";
import type { DprStructuredData } from "@buildflow/domain/dpr/schema";

export const TEMPLATE_VERSION = "dpr-pdf.v1";

export async function renderDprPdf(input: {
  documentId: string; version: number; reportDate: string;
  data: DprStructuredData; summaryClientSafe: string; issuedBy: string;
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
