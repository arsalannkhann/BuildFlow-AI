import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { budgetLines, budgets, costCodes, poLines, purchaseOrders } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type CostCode = typeof costCodes.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type BudgetLine = typeof budgetLines.$inferSelect;

const org = (ctx: TenantContext) => ctx.organizationId;
const asInt = (v: string | null | undefined): number => Number(v ?? 0);

// --- cost codes (org-level chart) ---

export async function listCostCodes(db: AppDb, ctx: TenantContext): Promise<CostCode[]> {
  return db.select().from(costCodes)
    .where(eq(costCodes.organizationId, org(ctx)))
    .orderBy(asc(costCodes.code));
}

export async function getCostCode(db: AppDb, ctx: TenantContext, id: string): Promise<CostCode | null> {
  const [row] = await db.select().from(costCodes)
    .where(and(eq(costCodes.organizationId, org(ctx)), eq(costCodes.id, id)));
  return row ?? null;
}

export async function findCostCodeByCode(db: AppDb, ctx: TenantContext, code: string): Promise<CostCode | null> {
  const [row] = await db.select().from(costCodes)
    .where(and(eq(costCodes.organizationId, org(ctx)), sql`lower(${costCodes.code}) = ${code.toLowerCase()}`));
  return row ?? null;
}

export async function addCostCode(db: AppDb, ctx: TenantContext, input: {
  code: string; name: string; parentId?: string | null;
}): Promise<CostCode> {
  const [row] = await db.insert(costCodes).values({
    id: newId(), organizationId: org(ctx), code: input.code, name: input.name,
    parentId: input.parentId ?? null,
  }).returning();
  return row;
}

// --- budgets: immutable versions ---

export async function listBudgets(db: AppDb, ctx: TenantContext, projectId: string): Promise<Budget[]> {
  return db.select().from(budgets)
    .where(and(eq(budgets.organizationId, org(ctx)), eq(budgets.projectId, projectId)))
    .orderBy(desc(budgets.version));
}

export async function getActiveBudget(db: AppDb, ctx: TenantContext, projectId: string): Promise<Budget | null> {
  const [row] = await db.select().from(budgets).where(and(
    eq(budgets.organizationId, org(ctx)), eq(budgets.projectId, projectId),
    eq(budgets.status, "active"),
  )).orderBy(desc(budgets.version)).limit(1);
  return row ?? null;
}

/**
 * Inserts the next budget version and supersedes all prior versions in one transaction.
 * Lines are written once and never edited — a revision is a whole new version.
 */
export async function addBudgetVersion(db: AppDb, ctx: TenantContext, input: {
  projectId: string; note?: string | null;
  lines: { costCodeId: string; description: string; quantity?: string | null; unit?: string | null; amountPaise: number }[];
}): Promise<Budget> {
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    const [{ max }] = (await tx.execute(sql`
      select coalesce(max(version), 0)::int as max from "budget"
      where organization_id = ${org(ctx)} and project_id = ${input.projectId}
    `) as unknown as { rows: { max: number }[] }).rows;
    await tx.update(budgets).set({ status: "superseded" }).where(and(
      eq(budgets.organizationId, org(ctx)), eq(budgets.projectId, input.projectId),
      eq(budgets.status, "active"),
    ));
    const [budget] = await tx.insert(budgets).values({
      id: newId(), organizationId: org(ctx), projectId: input.projectId,
      version: max + 1, status: "active", note: input.note ?? null, createdBy: ctx.userId,
    }).returning();
    for (const [index, line] of input.lines.entries()) {
      await tx.insert(budgetLines).values({
        id: newId(), organizationId: org(ctx), budgetId: budget.id,
        costCodeId: line.costCodeId, description: line.description,
        quantity: line.quantity ?? null, unit: line.unit ?? null,
        amountPaise: line.amountPaise, sortOrder: index,
      });
    }
    return budget;
  });
}

export async function listBudgetLines(db: AppDb, ctx: TenantContext, budgetId: string): Promise<BudgetLine[]> {
  return db.select().from(budgetLines)
    .where(and(eq(budgetLines.organizationId, org(ctx)), eq(budgetLines.budgetId, budgetId)))
    .orderBy(asc(budgetLines.sortOrder));
}

// --- committed = approved/exported purchase orders ---

export type CommittedByCode = { costCodeId: string | null; committedPaise: number };

export async function committedByCostCode(db: AppDb, ctx: TenantContext, projectId: string): Promise<CommittedByCode[]> {
  const rows = await db.select({
    costCodeId: poLines.costCodeId,
    committed: sql<string>`coalesce(sum(${poLines.amountPaise}), 0)::text`,
  }).from(poLines)
    .innerJoin(purchaseOrders, eq(poLines.purchaseOrderId, purchaseOrders.id))
    .where(and(
      eq(poLines.organizationId, org(ctx)),
      eq(purchaseOrders.organizationId, org(ctx)),
      eq(purchaseOrders.projectId, projectId),
      inArray(purchaseOrders.status, ["approved", "exported"]),
    ))
    .groupBy(poLines.costCodeId);
  return rows.map((r) => ({ costCodeId: r.costCodeId, committedPaise: asInt(r.committed) }));
}
