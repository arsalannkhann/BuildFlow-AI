"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Polls the server-rendered page while background processing is running
// (JOBS_MODE=worker); inline mode never renders in a pending state.
export function AutoRefresh({ intervalMs = 2000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
