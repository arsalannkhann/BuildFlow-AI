import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "info" | "warn" | "error";

// Deliberately closed vocabulary: callers cannot accidentally log report text, names,
// email addresses, tokens, file paths, provider payloads, or arbitrary error messages.
export type SafeLogFields = {
  traceId?: string;
  organizationId?: string;
  userId?: string;
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  jobId?: string;
  jobKind?: string;
  attempt?: number;
  errorCategory?: string;
  count?: number;
};

const traceStore = new AsyncLocalStorage<{ traceId: string }>();

export function withTrace<T>(traceId: string, fn: () => T): T {
  return traceStore.run({ traceId }, fn);
}

export function currentTraceId(): string | undefined {
  return traceStore.getStore()?.traceId;
}

export function errorCategory(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 80);
  }
  return error instanceof Error ? error.name.slice(0, 80) : "unknown_error";
}

export function logEvent(level: LogLevel, event: string, fields: SafeLogFields = {}): void {
  const record = {
    timestamp: new Date().toISOString(), level, event,
    ...fields,
    traceId: fields.traceId ?? currentTraceId(),
  };
  // The only raw console sink in product code; CI audits all other console calls.
  const line = `${JSON.stringify(record)}\n`;
  if (level === "error") process.stderr.write(line);
  else process.stdout.write(line);
}
