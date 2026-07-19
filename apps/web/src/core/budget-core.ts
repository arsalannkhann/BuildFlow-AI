import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan } from "@buildflow/domain/tenancy";
import { parseCsv, csvRecords } from "@buildflow/domain/csv";
import { parseINRToPaise } from "@buildflow/domain/money";
import { isDecimalString, normalizeDecimal } from "@buildflow/domain/decimal";
import { computeEac, type EacResult } from "@buildflow/domain/eac";
import {
  addBudgetVersion, addCostCode, committedByCostCode, findCostCodeByCode, getActiveBudget,
  listBudgetLines, listBudgets, listCostCodes, type Budget, type BudgetLine,
} from "@buildflow/db/queries/budgets";
import { actualsByCostCode, invoicedTotalPaise, paidTotalPaise } from "@buildflow/db/queries/invoices";
import { audit } from "@buildflow/db/queries/audit";

export async function createCostCode(db: AppDb, ctx: TenantContext, input: {
  code: string; name: string;
}): Promise<string> {
  assertCan(ctx, "budget.manage");
  if (!input.code?.trim() || !input.name?.trim()) throw new Error("Code and name are required");
  if (await findCostCodeByCode(db, ctx, input.code.trim())) throw new Error("Cost code already exists");
  const row = await addCostCode(db, ctx, { code: input.code.trim(), name: input.name.trim() });
  await audit(db, ctx, { action: "budget.cost_code_created", subjectRef: row.id, metadata: { code: row.code } });
  return row.id;
}

// CSV columns: code, description, quantity (optional), unit (optional), amount_inr.
// Import ALWAYS creates a new immutable version; prior versions stay readable forever.
export async function importBudgetCsv(
  db: AppDb, ctx: TenantContext, projectId: string, csvText: string, note?: string,
): Promise<{ budgetId: string; version: number; lines: number }> {
  assertCan(ctx, "budget.manage");
  const records = csvRecords(parseCsv(csvText), ["code", "description", "amount_inr"]);
  const lines: { costCodeId: string; description: string; quantity?: string | null; unit?: string | null; amountPaise: number }[] = [];
  for (const [index, record] of records.entries()) {
    const code = record.code.trim();
    if (!code) throw new Error(`Row ${index + 2}: code is required`);
    let costCode = await findCostCodeByCode(db, ctx, code);
    costCode ??= await addCostCode(db, ctx, { code, name: record.description || code });
    if (record.quantity && !isDecimalString(record.quantity)) {
      throw new Error(`Row ${index + 2}: quantity must be a decimal number`);
    }
    let amountPaise: number;
    try {
      amountPaise = parseINRToPaise(record.amount_inr);
    } catch {
      throw new Error(`Row ${index + 2}: amount_inr must be an INR amount (e.g. 12,34,567.89)`);
    }
    if (amountPaise < 0) throw new Error(`Row ${index + 2}: amount must not be negative`);
    lines.push({
      costCodeId: costCode.id, description: record.description || code,
      quantity: record.quantity ? normalizeDecimal(record.quantity) : null,
      unit: record.unit || null, amountPaise,
    });
  }
  if (lines.length === 0) throw new Error("CSV has no budget lines");
  const budget = await addBudgetVersion(db, ctx, { projectId, note: note ?? null, lines });
  await audit(db, ctx, {
    action: "budget.version_created", subjectRef: budget.id,
    metadata: { version: budget.version, lines: lines.length },
  });
  return { budgetId: budget.id, version: budget.version, lines: lines.length };
}

// --- budget vs actual vs committed + deterministic EAC ---

export type BudgetRollupRow = {
  costCodeId: string | null;
  code: string;
  name: string;
  budgetPaise: number;
  actualPaise: number;
  committedPaise: number;
  variancePaise: number; // budget − actual
};

export type BudgetRollup = {
  budget: Budget | null;
  versions: Budget[];
  rows: BudgetRollupRow[];
  totals: {
    budgetPaise: number; actualPaise: number; committedPaise: number;
    invoicedPaise: number; paidPaise: number;
  };
  eac: EacResult;
};

export async function budgetRollup(db: AppDb, ctx: TenantContext, projectId: string): Promise<BudgetRollup> {
  assertCan(ctx, "budget.read");
  const [versions, codes, actuals, committed, invoicedPaise, paidPaise] = await Promise.all([
    listBudgets(db, ctx, projectId),
    listCostCodes(db, ctx),
    actualsByCostCode(db, ctx, projectId),
    committedByCostCode(db, ctx, projectId),
    invoicedTotalPaise(db, ctx, projectId),
    paidTotalPaise(db, ctx, projectId),
  ]);
  const active = versions.find((b) => b.status === "active") ?? null;
  const budgetLines: BudgetLine[] = active ? await listBudgetLines(db, ctx, active.id) : [];

  const codeOf = new Map(codes.map((c) => [c.id, c]));
  const actualOf = new Map(actuals.map((a) => [a.costCodeId ?? "", a.actualPaise]));
  const committedOf = new Map(committed.map((c) => [c.costCodeId ?? "", c.committedPaise]));
  const budgetOf = new Map<string, number>();
  for (const line of budgetLines) {
    budgetOf.set(line.costCodeId, (budgetOf.get(line.costCodeId) ?? 0) + line.amountPaise);
  }

  const allCodeIds = new Set<string>([...budgetOf.keys(), ...actualOf.keys(), ...committedOf.keys()]);
  allCodeIds.delete("");
  const rows: BudgetRollupRow[] = [...allCodeIds].map((id) => {
    const budgetPaise = budgetOf.get(id) ?? 0;
    const actualPaise = actualOf.get(id) ?? 0;
    return {
      costCodeId: id,
      code: codeOf.get(id)?.code ?? "?",
      name: codeOf.get(id)?.name ?? "Unknown cost code",
      budgetPaise, actualPaise,
      committedPaise: committedOf.get(id) ?? 0,
      variancePaise: budgetPaise - actualPaise,
    };
  }).sort((a, b) => a.code.localeCompare(b.code));
  const uncodedActual = actualOf.get("") ?? 0;
  const uncodedCommitted = committedOf.get("") ?? 0;
  if (uncodedActual > 0 || uncodedCommitted > 0) {
    rows.push({
      costCodeId: null, code: "—", name: "Uncoded",
      budgetPaise: 0, actualPaise: uncodedActual, committedPaise: uncodedCommitted,
      variancePaise: -uncodedActual,
    });
  }

  const totals = {
    budgetPaise: rows.reduce((s, r) => s + r.budgetPaise, 0),
    actualPaise: rows.reduce((s, r) => s + r.actualPaise, 0),
    committedPaise: rows.reduce((s, r) => s + r.committedPaise, 0),
    invoicedPaise, paidPaise,
  };

  // Remaining budget counts only lines that are NOT yet overrun; overruns contribute 0.
  const remainingBudgetPaise = rows.reduce((s, r) => s + Math.max(0, r.budgetPaise - r.actualPaise), 0);
  const committedNotInvoicedPaise = Math.max(0, totals.committedPaise - invoicedPaise);
  const eac = computeEac({
    actualToDatePaise: totals.actualPaise, remainingBudgetPaise, committedNotInvoicedPaise,
  });

  return { budget: active, versions, rows, totals, eac };
}
