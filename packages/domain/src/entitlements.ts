export const PLANS = ["starter", "professional", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];
export const BILLING_STATUSES = ["trial", "active", "past_due", "paused"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export type UsageMeters = {
  projects: number;
  users: number;
  storageBytes: number;
  aiRunsThisMonth: number;
};

export type EntitledResource = "projects" | "users" | "storageBytes" | "aiRunsThisMonth";

export const PLAN_LIMITS: Record<Plan, Record<EntitledResource, number | null>> = {
  starter: { projects: 2, users: 10, storageBytes: 10 * 1024 ** 3, aiRunsThisMonth: 1_000 },
  professional: { projects: 25, users: 100, storageBytes: 250 * 1024 ** 3, aiRunsThisMonth: 25_000 },
  enterprise: { projects: null, users: null, storageBytes: null, aiRunsThisMonth: null },
};

export type EntitlementDecision = {
  allowed: boolean;
  limit: number | null;
  used: number;
  message?: string;
};

export function entitlementDecision(
  plan: Plan,
  billingStatus: BillingStatus,
  usage: UsageMeters,
  resource: EntitledResource,
  increment = 1,
): EntitlementDecision {
  const limit = PLAN_LIMITS[plan][resource];
  const used = usage[resource];
  if (billingStatus === "paused") {
    return { allowed: false, limit, used, message: "Billing is paused. Ask an organization owner to reactivate the workspace." };
  }
  if (limit !== null && used + increment > limit) {
    const planName = plan === "professional" ? "Professional" : plan[0].toUpperCase() + plan.slice(1);
    return {
      allowed: false, limit, used,
      message: `${planName} includes up to ${limit.toLocaleString("en-IN")} ${resource === "users" ? "users" : "projects"}. Upgrade the plan or reduce current usage.`,
    };
  }
  return { allowed: true, limit, used };
}

export function assertEntitled(
  plan: Plan,
  billingStatus: BillingStatus,
  usage: UsageMeters,
  resource: EntitledResource,
  increment = 1,
): void {
  const decision = entitlementDecision(plan, billingStatus, usage, resource, increment);
  if (!decision.allowed) throw new Error(decision.message);
}

export function parsePlan(value: string): Plan {
  if ((PLANS as readonly string[]).includes(value)) return value as Plan;
  throw new Error(`Unknown plan: ${value}`);
}

export function parseBillingStatus(value: string): BillingStatus {
  if ((BILLING_STATUSES as readonly string[]).includes(value)) return value as BillingStatus;
  throw new Error(`Unknown billing status: ${value}`);
}
