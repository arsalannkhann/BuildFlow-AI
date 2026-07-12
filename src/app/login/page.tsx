import { loginAction } from "@/app/actions/auth";
import { SEED } from "@/db/seed";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-xl font-bold text-brand-900">Sign in (dev)</h1>
      <form action={loginAction} className="space-y-2">
        <button name="userId" value={SEED.engineer.id} className="w-full rounded-control bg-accent-600 py-3 text-white">
          Continue as Site Engineer
        </button>
        <button name="userId" value={SEED.manager.id} className="w-full rounded-control bg-brand-700 py-3 text-white">
          Continue as Project Manager
        </button>
      </form>
    </main>
  );
}
