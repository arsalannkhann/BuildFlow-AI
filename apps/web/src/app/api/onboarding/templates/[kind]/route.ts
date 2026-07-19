const templates: Record<string, string> = {
  locations: "name,kind,parent\r\nMain Site,site,\r\nTower A,building,Main Site\r\nLevel 01,floor,Tower A\r\n",
  activities: "name,unit,location\r\nRCC column casting,cum,Level 01\r\nBlockwork,sqm,Level 01\r\n",
};

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const csv = templates[kind];
  if (!csv) return new Response("Template not found", { status: 404 });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="buildflow-${kind}-template.csv"`,
      "x-content-type-options": "nosniff", "cache-control": "public, max-age=3600",
    },
  });
}
