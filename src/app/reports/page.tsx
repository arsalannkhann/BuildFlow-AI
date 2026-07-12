import Link from "next/link";
import { getDb } from "@/db/client";
import { currentContext } from "@/app/session";
import { listReports } from "@/db/queries/reports";

export default async function ReportsPage() {
  const db = await getDb();
  const ctx = await currentContext();
  const reports = await listReports(db, ctx);
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-900">Reports</h1>
        <Link href="/capture" className="rounded-control bg-accent-600 px-4 py-2 text-white">Record update</Link>
      </div>
      <ul className="space-y-2">
        {reports.map((r) => (
          <li key={r.id}>
            <Link href={`/reports/${r.id}`} className="flex justify-between rounded-card border border-[var(--neutral-200)] bg-white p-4">
              <span>{r.reportDate}</span>
              <span className="text-sm text-brand-700">{r.status}</span>
            </Link>
          </li>
        ))}
        {reports.length === 0 && <p className="text-[var(--neutral-500)]">No reports yet. Record your first update.</p>}
      </ul>
    </main>
  );
}
