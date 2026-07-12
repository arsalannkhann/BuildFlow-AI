import Link from "next/link";
export default function Home() {
  return (
    <main className="mx-auto max-w-md space-y-3 p-8">
      <h1 className="text-2xl font-bold text-brand-900">BuildFlow</h1>
      <p className="text-[var(--neutral-700)]">Turn site voice notes and photos into daily progress reports.</p>
      <Link href="/login" className="inline-block rounded-control bg-brand-700 px-4 py-2 text-white">Sign in</Link>
    </main>
  );
}
