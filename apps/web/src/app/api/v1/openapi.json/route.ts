import { openApiV1 } from "@buildflow/contracts/openapi";

export async function GET() {
  return Response.json(openApiV1, {
    headers: { "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" },
  });
}
