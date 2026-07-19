import { formatINR } from "./money";

// Deterministic, explainable Estimate At Completion (docs/PHASE-D-DESIGN.md):
//   EAC = actual-to-date + max(remaining budget on lines without overrun,
//                              committed-not-yet-invoiced)
// Every figure ships with its formula string — never an unexplained number
// (design.md: no unexplained percentages or predictions).

export type EacInput = {
  actualToDatePaise: number;
  /** Sum over budget lines of max(0, line budget − actuals on that cost code). */
  remainingBudgetPaise: number;
  /** max(0, committed (approved POs) − invoiced (approved invoices)). */
  committedNotInvoicedPaise: number;
};

export type EacResult = { eacPaise: number; formula: string };

export function computeEac(input: EacInput): EacResult {
  const { actualToDatePaise, remainingBudgetPaise, committedNotInvoicedPaise } = input;
  for (const [label, v] of Object.entries(input)) {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error(`${label} must be a non-negative integer paise amount`);
  }
  const tail = Math.max(remainingBudgetPaise, committedNotInvoicedPaise);
  const eacPaise = actualToDatePaise + tail;
  const formula =
    `EAC = actual to date ${formatINR(actualToDatePaise)}` +
    ` + max(remaining budget ${formatINR(remainingBudgetPaise)},` +
    ` committed not invoiced ${formatINR(committedNotInvoicedPaise)})` +
    ` = ${formatINR(eacPaise)}`;
  return { eacPaise, formula };
}
