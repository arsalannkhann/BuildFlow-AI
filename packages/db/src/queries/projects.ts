import { and, asc, eq } from "drizzle-orm";
import type { AppDb } from "@buildflow/db/client";
import { projects } from "@buildflow/db/schema";
import { newId } from "@buildflow/domain/ids";
import type { TenantContext } from "@buildflow/domain/tenancy";

export type ProjectRow = typeof projects.$inferSelect;

export type ProjectSettings = {
  name: string; clientName?: string | null; timezone?: string; address?: string | null;
  reportCutoff?: string | null; latitude?: number | null; longitude?: number | null;
  reportTemplate?: string | null; defaultRecipients?: string[] | null;
};

export async function listProjects(db: AppDb, ctx: TenantContext): Promise<ProjectRow[]> {
  return db.select().from(projects)
    .where(eq(projects.organizationId, ctx.organizationId))
    .orderBy(asc(projects.name));
}

export async function getProject(db: AppDb, ctx: TenantContext, id: string): Promise<ProjectRow> {
  const [row] = await db.select().from(projects).where(and(
    eq(projects.id, id), eq(projects.organizationId, ctx.organizationId)));
  if (!row) throw new Error("Project not found");
  return row;
}

export async function createProject(
  db: AppDb, ctx: TenantContext, input: ProjectSettings,
): Promise<ProjectRow> {
  const [row] = await db.insert(projects).values({
    id: newId(), organizationId: ctx.organizationId, name: input.name,
    clientName: input.clientName ?? null, timezone: input.timezone ?? "Asia/Kolkata",
    address: input.address ?? null, reportCutoff: input.reportCutoff ?? null,
    latitude: input.latitude ?? null, longitude: input.longitude ?? null,
    reportTemplate: input.reportTemplate ?? null,
    defaultRecipients: input.defaultRecipients ?? null,
  }).returning();
  return row;
}

export async function updateProject(
  db: AppDb, ctx: TenantContext, id: string, input: Partial<ProjectSettings>,
): Promise<ProjectRow> {
  await getProject(db, ctx, id); // tenant check
  const [row] = await db.update(projects).set(input).where(and(
    eq(projects.id, id), eq(projects.organizationId, ctx.organizationId))).returning();
  return row;
}
