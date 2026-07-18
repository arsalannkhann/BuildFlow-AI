import { and, asc, eq } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { activities, locations } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type LocationRow = typeof locations.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect;

const scoped = (ctx: TenantContext, projectId: string) => {
  if (!projectId) throw new Error("projectId required");
  return { organizationId: ctx.organizationId, projectId };
};

export async function listLocations(db: AppDb, ctx: TenantContext, projectId: string): Promise<LocationRow[]> {
  return db.select().from(locations).where(and(
    eq(locations.organizationId, ctx.organizationId), eq(locations.projectId, projectId),
  )).orderBy(asc(locations.sortOrder), asc(locations.name));
}

export async function addLocation(db: AppDb, ctx: TenantContext, input: {
  projectId: string; name: string; kind: string; parentId?: string | null; sortOrder?: number;
}): Promise<LocationRow> {
  const [row] = await db.insert(locations).values({
    id: newId(), ...scoped(ctx, input.projectId), parentId: input.parentId ?? null,
    kind: input.kind, name: input.name, sortOrder: input.sortOrder ?? 0,
  }).returning();
  return row;
}

export async function listActivities(db: AppDb, ctx: TenantContext, projectId: string): Promise<ActivityRow[]> {
  return db.select().from(activities).where(and(
    eq(activities.organizationId, ctx.organizationId), eq(activities.projectId, projectId),
  )).orderBy(asc(activities.sortOrder), asc(activities.name));
}

export async function addActivity(db: AppDb, ctx: TenantContext, input: {
  projectId: string; name: string; unit?: string | null; locationId?: string | null; sortOrder?: number;
}): Promise<ActivityRow> {
  const [row] = await db.insert(activities).values({
    id: newId(), ...scoped(ctx, input.projectId), name: input.name,
    unit: input.unit ?? null, locationId: input.locationId ?? null, sortOrder: input.sortOrder ?? 0,
  }).returning();
  return row;
}
