import { expect, test } from "vitest";
import { dprHtml } from "./template";
import { DPR_SCHEMA_VERSION, type DprStructuredData } from "@buildflow/domain/dpr/schema";

const supported = { source_refs: [], confidence_band: "Supported" as const };

const fullData: DprStructuredData = {
  schema_version: DPR_SCHEMA_VERSION,
  work_items: [{
    description: "Casting of column C4", location: "Tower A / L3", activity: "RCC",
    quantity: { value: "2.5", unit: "cum" }, ...supported,
  }],
  labour: [
    { trade: "mason", count: 6, ...supported },
    { trade: "helper", count: 4, ...supported },
  ],
  materials: [{
    name: "cement", status: "delayed", quantity: { value: "20", unit: "bag" }, unit: "bag",
    source_refs: [], confidence_band: "Check",
  }],
  equipment: [{ name: "Tower crane", status: "used", ...supported }],
  safety_quality: [{ note: "Edge protection installed on level 3", ...supported }],
  blockers: [{
    description: "Cement delivery delayed", cause: "Supplier truck breakdown",
    owner: "Procurement", expected_resolution: "2026-07-21", source_refs: [],
    confidence_band: "Check",
  }],
  weather_site_condition: { value: "Heavy rain until 11:00", ...supported },
  tomorrow_plan: [{ item: "Slab shuttering", ...supported }],
};

const render = () => dprHtml({
  documentId: "doc-1", version: 2, reportDate: "2026-07-20", data: fullData,
  summaryClientSafe: "Column C4 cast; cement delivery delayed.", issuedBy: "user-1",
  dprNumber: 142, organizationName: "Tenvor Infra", projectName: "Sector 62 Tower A",
  clientName: "NCR Developers", siteAddress: "Sector 62, Noida",
  submittedBy: "Site Engineer", approvedBy: "Project Manager", approvedAt: "2026-07-20 18:30",
});

test("every dpr.v1 section reaches the issued document", () => {
  const html = render();
  // These three were extracted, reviewed and then silently dropped before template v3.
  expect(html).toContain("Heavy rain until 11:00");
  expect(html).toContain("Edge protection installed on level 3");
  expect(html).toContain("Tower crane");
  // ...alongside the sections that always rendered.
  expect(html).toContain("Casting of column C4");
  expect(html).toContain("cement");
  expect(html).toContain("Cement delivery delayed");
  expect(html).toContain("Slab shuttering");
});

test("quantities and labour render as tables with a headcount total", () => {
  const html = render();
  expect(html).toContain("<thead>");
  expect(html).toMatch(/Quantity/);
  expect(html).toContain("Tower A / L3");
  expect(html).toContain("<tfoot>");
  expect(html).toMatch(/>10</); // 6 masons + 4 helpers
});

test("document identity, serial and signature block are present", () => {
  const html = render();
  expect(html).toContain("DPR No. 142");
  expect(html).toContain("Sector 62 Tower A");
  expect(html).toContain("NCR Developers");
  expect(html).toContain("Submitted by (site)");
  expect(html).toContain("Project Manager");
  expect(html).toContain("Client / consultant representative");
});

test("unconfirmed items are visibly flagged and explained", () => {
  const html = render();
  expect(html).toContain("flag--check");
  expect(html).toContain("were not fully confirmed");
});

test("a superseded revision says so on the document", () => {
  const html = dprHtml({
    documentId: "doc-1", version: 1, reportDate: "2026-07-20", data: fullData,
    summaryClientSafe: "", issuedBy: "user-1", superseded: true,
  });
  expect(html).toContain("SUPERSEDED");
});

test("transcript-derived text is escaped, never injected as markup", () => {
  const html = dprHtml({
    documentId: "d", version: 1, reportDate: "2026-07-20",
    data: {
      ...fullData,
      safety_quality: [{ note: "<script>alert(1)</script>", ...supported }],
    },
    summaryClientSafe: "<img onerror=x>", issuedBy: "u",
  });
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<img onerror=x>");
});
