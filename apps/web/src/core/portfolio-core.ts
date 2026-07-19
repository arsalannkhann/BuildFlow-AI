import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan, can } from "@buildflow/domain/tenancy";
import { listProjects, type ProjectRow } from "@buildflow/db/queries/projects";
import { listInvoices } from "@buildflow/db/queries/invoices";
import { listMbEntries } from "@buildflow/db/queries/mb";
import { listPurchaseOrders } from "@buildflow/db/queries/procurement";
import { jobHealth, userMembershipScope, type JobHealth } from "@buildflow/db/queries/portfolio";
import { projectOverview, type ProjectOverview } from "@/core/controls-core";
import { shortageAlerts, type ShortageAlert } from "@/core/materials-core";
import { budgetRollup } from "@/core/budget-core";

// Exception-first portfolio dashboard (design.md §9): every number is a deterministic
// aggregate of EXISTING records via existing queries — no new tables, no prediction —
// and every tile links to the page where its records live.

export type ProjectExceptions = {
  project: ProjectRow;
  /** No report at all for today (project-local date handled upstream as ISO dates). */
  missingToday: boolean;
  awaitingReview: number;
  processingFailures: number;
  delayIndicators: ProjectOverview["delayIndicators"];
  criticalOpenBlockers: number;
  overdueBlockers: number;
  shortages: ShortageAlert[];
  invoicesPending: number; // draft or reviewed, not yet approved
  poDraftsAwaitingApproval: number;
  mbAwaitingVerification: number;
  /** 7-day submission completeness: days with an approved report / 7. */
  reportedDays7: number;
  approvedDays7: number;
  budget: { budgetPaise: number; actualPaise: number; committedPaise: number } | null;
};

export type Portfolio = {
  projects: ProjectExceptions[];
  totals: {
    missingToday: number; awaitingReview: number; processingFailures: number;
    delayed: number; criticalOpenBlockers: number; overdueBlockers: number;
    shortages: number; invoicesPending: number; poDraftsAwaitingApproval: number;
    mbAwaitingVerification: number;
    budget: { budgetPaise: number; actualPaise: number; committedPaise: number } | null;
  };
  jobs: JobHealth;
  canSeeBudget: boolean;
};

export async function portfolioOverview(
  db: AppDb, ctx: TenantContext, today: string = new Date().toISOString().slice(0, 10),
): Promise<Portfolio> {
  assertCan(ctx, "project.read");
  const scope = await userMembershipScope(db, ctx);
  const all = await listProjects(db, ctx);
  const visible = scope.orgWide || can(ctx, "org.audit.read")
    ? all
    : all.filter((p) => scope.projectIds.includes(p.id));
  const canSeeBudget = can(ctx, "budget.read");

  const projects: ProjectExceptions[] = [];
  for (const project of visible) {
    const overview = await projectOverview(db, ctx, project.id, today);
    const [shortages, invoices, pos, mbEntries] = await Promise.all([
      shortageAlerts(db, ctx, project.id),
      listInvoices(db, ctx, project.id),
      listPurchaseOrders(db, ctx, project.id),
      listMbEntries(db, ctx, project.id),
    ]);
    let budget: ProjectExceptions["budget"] = null;
    if (canSeeBudget) {
      const rollup = await budgetRollup(db, ctx, project.id);
      budget = {
        budgetPaise: rollup.totals.budgetPaise,
        actualPaise: rollup.totals.actualPaise,
        committedPaise: rollup.totals.committedPaise,
      };
    }
    const openBySeverity = overview.openBlockersBySeverity;
    projects.push({
      project,
      missingToday: !overview.reporting.last7Days[0]?.hasAny,
      awaitingReview: overview.reporting.awaitingReview,
      processingFailures: overview.reporting.failures,
      delayIndicators: overview.delayIndicators,
      criticalOpenBlockers: openBySeverity.critical ?? 0,
      overdueBlockers: overview.overdueBlockers.length,
      shortages,
      invoicesPending: invoices.filter((i) => i.status !== "approved").length,
      poDraftsAwaitingApproval: pos.filter((p) => p.status === "draft").length,
      mbAwaitingVerification: mbEntries.filter((m) => m.status === "submitted").length,
      reportedDays7: overview.reporting.last7Days.filter((d) => d.hasAny).length,
      approvedDays7: overview.reporting.last7Days.filter((d) => d.hasApproved).length,
      budget,
    });
  }

  const sum = (f: (p: ProjectExceptions) => number) => projects.reduce((a, p) => a + f(p), 0);
  return {
    projects,
    totals: {
      missingToday: sum((p) => (p.missingToday ? 1 : 0)),
      awaitingReview: sum((p) => p.awaitingReview),
      processingFailures: sum((p) => p.processingFailures),
      delayed: sum((p) => p.delayIndicators.length),
      criticalOpenBlockers: sum((p) => p.criticalOpenBlockers),
      overdueBlockers: sum((p) => p.overdueBlockers),
      shortages: sum((p) => p.shortages.length),
      invoicesPending: sum((p) => p.invoicesPending),
      poDraftsAwaitingApproval: sum((p) => p.poDraftsAwaitingApproval),
      mbAwaitingVerification: sum((p) => p.mbAwaitingVerification),
      budget: canSeeBudget ? {
        budgetPaise: sum((p) => p.budget?.budgetPaise ?? 0),
        actualPaise: sum((p) => p.budget?.actualPaise ?? 0),
        committedPaise: sum((p) => p.budget?.committedPaise ?? 0),
      } : null,
    },
    jobs: await jobHealth(db, ctx),
    canSeeBudget,
  };
}
