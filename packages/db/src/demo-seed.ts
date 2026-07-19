import type { AppDb } from "./client";
import { seed, SEED } from "./seed";
import {
  budgetLines, budgets, costCodes, dailyReports, materials, mbEntries, projects,
  reportRevisions, stockTransactions,
} from "./schema";

export const DEMO_SECOND_PROJECT_ID = "demo-dwarka-logistics";

const supported = { source_refs: [], confidence_band: "Supported" as const };

function reportData(day: number, projectName: string) {
  return {
    schema_version: "dpr.v1" as const,
    work_items: [{
      description: day % 2 === 0 ? "Slab reinforcement and shuttering" : "Blockwork and service coordination",
      location: day % 2 === 0 ? "Tower A, Level 8" : "Ground floor services zone",
      activity: "Civil works", quantity: { value: String(18 + day), unit: "sqm" }, ...supported,
    }],
    labour: [{ trade: day % 2 === 0 ? "Bar benders" : "Masons", count: 16 + day, ...supported }],
    materials: [{ name: day % 2 === 0 ? "TMT steel" : "AAC blocks", status: "used" as const, quantity: null, unit: day % 2 === 0 ? "kg" : "nos", ...supported }],
    equipment: [{ name: "Tower crane", status: "used" as const, ...supported }],
    safety_quality: [{ note: "Pre-start briefing completed; access routes checked.", ...supported }],
    blockers: day === 5 ? [{ description: "MEP sleeve drawing clarification pending", cause: "Revision under review", owner: "Design coordinator", expected_resolution: "2026-07-18", ...supported }] : [],
    weather_site_condition: { value: "Warm, dry working conditions", ...supported },
    tomorrow_plan: [{ item: `Continue planned ${projectName} workfront`, ...supported }],
  };
}

/** Deterministic, synthetic-only dataset for demos and acceptance walkthroughs. */
export async function seedDemo(db: AppDb): Promise<void> {
  await seed(db);
  await db.insert(projects).values({
    id: DEMO_SECOND_PROJECT_ID, organizationId: SEED.orgId,
    name: "Dwarka Expressway Logistics Hub", clientName: "Aravali Logistics Parks",
    timezone: "Asia/Kolkata", address: "Sector 113, Gurugram, Haryana",
  }).onConflictDoNothing();

  const projectsToSeed = [
    { id: SEED.projectId, name: "Sector 62 Tower A" },
    { id: DEMO_SECOND_PROJECT_ID, name: "Dwarka Expressway Logistics Hub" },
  ];
  for (const project of projectsToSeed) {
    for (let day = 0; day < 14; day += 1) {
      const date = new Date(Date.UTC(2026, 6, 19 - day)).toISOString().slice(0, 10);
      const reportId = `demo-report-${project.id}-${date}`;
      const revisionId = `demo-revision-${project.id}-${date}`;
      await db.insert(dailyReports).values({
        id: reportId, organizationId: SEED.orgId, projectId: project.id, reportDate: date,
        status: "APPROVED", createdBy: SEED.engineer.id, currentRevisionId: revisionId,
      }).onConflictDoNothing();
      await db.insert(reportRevisions).values({
        id: revisionId, organizationId: SEED.orgId, reportId, revisionNumber: 1,
        structuredData: reportData(day, project.name),
        summaryInternal: `Synthetic demo update for ${project.name} on ${date}.`,
        summaryClientSafe: `Planned site activities progressed at ${project.name}.`,
        createdBy: SEED.manager.id, isAiGenerated: true,
      }).onConflictDoNothing();
    }
  }

  const materialRows = [
    ["demo-material-cement", "OPC 43 grade cement", "bag", "25232910", "120"],
    ["demo-material-steel", "TMT steel Fe 500D", "kg", "72142090", "2500"],
    ["demo-material-block", "AAC block 600×200×150", "nos", "68101190", "400"],
    ["demo-material-sand", "Manufactured sand", "cum", "25051020", "18"],
  ] as const;
  for (const [id, name, unit, hsnCode, reorderThreshold] of materialRows) {
    await db.insert(materials).values({
      id, organizationId: SEED.orgId, name, unit, hsnCode, reorderThreshold,
    }).onConflictDoNothing();
  }
  for (const project of projectsToSeed) {
    for (const [index, material] of materialRows.entries()) {
      await db.insert(stockTransactions).values({
        id: `demo-stock-${project.id}-${index}`, organizationId: SEED.orgId, projectId: project.id,
        materialId: material[0], kind: "received", quantity: String(500 + index * 250), unit: material[2],
        sourceKind: "demo_seed", sourceId: `demo-stock-source-${project.id}-${index}`,
        note: "Synthetic opening stock", createdBy: SEED.owner.id,
      }).onConflictDoNothing();
    }
  }

  const codes = [
    ["demo-cc-civil", "CIV-100", "Civil and structural works"],
    ["demo-cc-mep", "MEP-200", "MEP services"],
    ["demo-cc-fin", "FIN-300", "Finishes"],
  ] as const;
  for (const [id, code, name] of codes) {
    await db.insert(costCodes).values({ id, organizationId: SEED.orgId, code, name }).onConflictDoNothing();
  }
  for (const project of projectsToSeed) {
    const budgetId = `demo-budget-${project.id}`;
    await db.insert(budgets).values({
      id: budgetId, organizationId: SEED.orgId, projectId: project.id,
      version: 1, status: "active", note: "Synthetic approved baseline", createdBy: SEED.owner.id,
    }).onConflictDoNothing();
    for (const [index, code] of codes.entries()) {
      await db.insert(budgetLines).values({
        id: `demo-budget-line-${project.id}-${index}`, organizationId: SEED.orgId,
        budgetId, costCodeId: code[0], description: code[2],
        amountPaise: [18_500_000_00, 7_250_000_00, 5_900_000_00][index]!, sortOrder: index,
      }).onConflictDoNothing();
    }
    for (let index = 0; index < 3; index += 1) {
      await db.insert(mbEntries).values({
        id: `demo-mb-${project.id}-${index}`, organizationId: SEED.orgId, projectId: project.id,
        mbNumber: index + 1, description: ["RCC slab concrete", "Internal blockwork", "Floor screed"][index]!,
        measurementDate: `2026-07-${String(14 + index).padStart(2, "0")}`,
        length: String(10 + index), breadth: String(8 + index), depth: index === 0 ? "0.15" : "1",
        count: 1, unit: index === 0 ? "cum" : "sqm", quantity: index === 0 ? "12" : String((10 + index) * (8 + index)),
        formula: "L×B×D×n", status: index === 0 ? "certified" : "verified",
        createdBy: SEED.owner.id, verifiedBy: SEED.manager.id, verifiedAt: new Date("2026-07-18T10:00:00Z"),
        certifiedBy: index === 0 ? SEED.owner.id : null, certifiedAt: index === 0 ? new Date("2026-07-18T11:00:00Z") : null,
      }).onConflictDoNothing();
    }
  }
}
