import { expect, test } from "vitest";
import {
  dprHtml, type ActivityProgressRow, type ProductivityBlock, type TrackedBlockerRow,
} from "./template";
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

// --- Tier 2 ---

const quotedData: DprStructuredData = {
  ...fullData,
  work_items: [{
    description: "Casting of column C4", location: "Tower A / L3", activity: "RCC",
    quantity: { value: "2.5", unit: "cum" },
    source_refs: [{ quote: "we completed casting of column C4" }],
    confidence_band: "Supported",
  }],
};

const progressRows: ActivityProgressRow[] = [{
  scheduleItemId: "s1", name: "Third floor slab", activityName: "RCC",
  baselineWindow: "2026-07-01 → 2026-07-15",
  planned: { value: null, unit: "cum", basis: "Planned quantity: no planned or baseline quantity is stored for this activity." },
  today: { value: "2.5", unit: "cum", basis: "Today: sum of 1 record(s)." },
  cumulative: { value: "9.5", unit: "cum", basis: "Cumulative to 2026-07-20, from 3 approved report(s)." },
  certified: { value: "8", unit: "cum", basis: "Certified to 2026-07-20, from MB entry #4." },
  progressPercent: 40, progressBasis: "Progress 40%: manually recorded 2026-07-19.",
}];

const trackedBlockers: TrackedBlockerRow[] = [{
  id: "b1", title: "Waterproofing membrane not delivered", severity: "high", status: "open",
  owner: "Procurement", dueDate: "2026-07-15", ageDays: 12, overdue: true,
}];

const productivity: ProductivityBlock = {
  date: "2026-07-20", headcount: 10, headcountBasis: "2 attendance record(s): helper 4, mason 6",
  rows: [{ unit: "cum", quantity: "2.5", perHead: "0.25", formula: "2.5 cum ÷ 10 workers = 0.25 cum per head" }],
  unavailableReason: null,
};

const renderVariant = (variant: "client" | "internal") => dprHtml({
  documentId: "doc-1", version: 2, reportDate: "2026-07-20", data: quotedData,
  summaryClientSafe: "Column C4 cast.", summaryInternal: "Engineer under-reported the rain delay.",
  issuedBy: "user-1", variant,
  activityProgress: progressRows, trackedBlockers, productivity,
});

test("the client variant carries no internal summary and no citation quotes", () => {
  const html = renderVariant("client");
  expect(html).not.toContain("Engineer under-reported the rain delay.");
  expect(html).not.toContain("Internal summary");
  expect(html).not.toContain("we completed casting of column C4");
  expect(html).not.toContain("INTERNAL");
  expect(html).toContain("Column C4 cast."); // the client-safe summary still renders
});

test("the internal variant marks itself and adds the internal summary, bands and quotes", () => {
  const html = renderVariant("internal");
  expect(html).toContain("INTERNAL — not for client distribution");
  expect(html).toContain("Internal summary");
  expect(html).toContain("Engineer under-reported the rain delay.");
  expect(html).toContain("we completed casting of column C4");
  expect(html).toContain("Confidence and cited evidence (internal)");
  // Every band is called out by name in the internal appendix, Supported included.
  // (Asserting on the rendered chip, not the class name, which also appears in the CSS.)
  expect(html).toContain(`flag--supported">Supported<`);
  expect(html).toContain(`flag--check">Check<`);
  expect(html).toMatch(/2 of \d+ items are Check or Missing/);
  // Items with no verified quote say so rather than implying evidence exists.
  expect(html).toContain("No verified words from the transcript support this item.");
});

test("an omitted variant defaults to the client document", () => {
  const html = dprHtml({
    documentId: "doc-1", version: 1, reportDate: "2026-07-20", data: quotedData,
    summaryClientSafe: "", summaryInternal: "internal only", issuedBy: "u",
  });
  expect(html).not.toContain("internal only");
  expect(html).not.toContain("INTERNAL");
  expect(html).not.toContain("we completed casting of column C4");
});

test("today, cumulative, certified and planned render side by side with their basis", () => {
  const html = renderVariant("client");
  expect(html).toContain("Progress against schedule");
  expect(html).toContain("Third floor slab");
  expect(html).toContain("2026-07-01 → 2026-07-15");
  expect(html).toContain("2.5 cum");
  expect(html).toContain("9.5 cum");
  expect(html).toContain("8 cum");
  expect(html).toContain("40%");
  expect(html).toContain("from 3 approved report(s)");
  // An unknown planned quantity prints an em dash, never a derived guess.
  expect(html).toContain("no planned or baseline quantity is stored");
  expect(html).toContain("—");
});

test("reported blockers and tracked project blockers are separate sections", () => {
  const html = renderVariant("client");
  expect(html).toContain("Blockers reported in this update");
  expect(html).toContain("Cement delivery delayed");        // from the DPR JSON
  expect(html).toContain("Blockers open on this project");
  expect(html).toContain("Waterproofing membrane not delivered"); // tracked record
  expect(html).toContain("OVERDUE");
  expect(html).toMatch(/>12</);                              // age in days
});

test("productivity shows the formula, and says so instead of a ratio when a side is missing", () => {
  expect(renderVariant("client")).toContain("2.5 cum ÷ 10 workers = 0.25 cum per head");

  const missing = dprHtml({
    documentId: "d", version: 1, reportDate: "2026-07-20", data: fullData,
    summaryClientSafe: "", issuedBy: "u",
    productivity: {
      date: "2026-07-20", headcount: null, headcountBasis: null, rows: [],
      unavailableReason: "Quantity per head is not shown: no labour attendance is recorded for 2026-07-20.",
    },
  });
  expect(missing).toContain("no labour attendance is recorded for 2026-07-20");
  expect(missing).not.toContain("Per head"); // no ratio table at all
  expect(missing).toContain("Labour productivity (2026-07-20)");
});

test("an unlinked report says so instead of showing an empty progress table", () => {
  const html = dprHtml({
    documentId: "d", version: 1, reportDate: "2026-07-20", data: fullData,
    summaryClientSafe: "", issuedBy: "u",
  });
  expect(html).toContain("not linked to any schedule activity");
  expect(html).toContain("No tracked blocker was open as at 2026-07-20.");
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
