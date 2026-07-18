import { NextResponse } from "next/server";
import { assertCan } from "@buildflow/domain/tenancy";
import { listActivities, listLocations } from "@buildflow/db/queries/reference";
import { problem, requireApiAuth } from "@/core/api-auth";

export async function GET(
  req: Request, { params }: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const { projectId } = await params;
  const auth = await requireApiAuth(req, { projectId });
  if (auth instanceof NextResponse) return auth;
  const { db, ctx } = auth;
  try { assertCan(ctx, "project.read"); } catch { return problem(403, "Not permitted"); }

  const [locations, activities] = await Promise.all([
    listLocations(db, ctx, projectId), listActivities(db, ctx, projectId),
  ]);
  return NextResponse.json({
    locations: locations.map((l) => ({ id: l.id, parentId: l.parentId, kind: l.kind, name: l.name })),
    activities: activities.map((a) => ({ id: a.id, name: a.name, unit: a.unit, locationId: a.locationId })),
  });
}
