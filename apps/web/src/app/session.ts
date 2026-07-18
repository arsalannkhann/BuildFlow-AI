import { SEED } from "@buildflow/db/seed";
import type { Capability, TenantContext } from "@buildflow/domain/tenancy";

const USERS: Record<string, { capabilities: Capability[] }> = {
  [SEED.engineer.id]: { capabilities: SEED.engineer.capabilities },
  [SEED.manager.id]: { capabilities: SEED.manager.capabilities },
};

export function contextForUser(userId: string): TenantContext {
  const u = USERS[userId];
  if (!u) throw new Error(`Unknown user: ${userId}`);
  return { organizationId: SEED.orgId, projectId: SEED.projectId, userId, capabilities: u.capabilities };
}

export async function currentContext(): Promise<TenantContext> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const userId = jar.get("bf_user")?.value ?? SEED.engineer.id;
  return contextForUser(userId);
}

export async function loginAs(userId: string): Promise<void> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  jar.set("bf_user", userId, { httpOnly: true, sameSite: "lax", path: "/" });
}
