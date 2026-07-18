import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { memberships, organizations, projects, users } from "@buildflow/db/schema";
import { ROLES, type Role } from "@buildflow/domain/tenancy";
import { requireApiAuth } from "@/core/api-auth";

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { db, ctx } = auth;

  const [user] = await db.select().from(users).where(eq(users.id, ctx.userId));
  const [org] = await db.select().from(organizations)
    .where(eq(organizations.id, ctx.organizationId));
  const rows = await db.select({ project: projects, membership: memberships })
    .from(memberships)
    .innerJoin(projects, eq(projects.id, memberships.projectId))
    .where(and(
      eq(memberships.userId, ctx.userId),
      eq(memberships.organizationId, ctx.organizationId),
      eq(projects.organizationId, ctx.organizationId),
    ));

  return NextResponse.json({
    userId: ctx.userId,
    displayName: user?.displayName ?? "",
    email: user?.email ?? null,
    organizationId: ctx.organizationId,
    organizationName: org?.name ?? "",
    projects: rows.map((r) => ({
      id: r.project.id,
      name: r.project.name,
      role: (ROLES as readonly string[]).includes(r.membership.role ?? "")
        ? (r.membership.role as Role) : null,
      timezone: r.project.timezone,
      clientName: r.project.clientName,
    })),
  });
}
