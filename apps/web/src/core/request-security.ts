import { NextResponse } from "next/server";
import type { AppDb } from "@buildflow/db/client";
import { consumeRateLimit } from "@buildflow/db/queries/rate-limits";
import { newId } from "@buildflow/domain/ids";
import {
  errorCategory, logEvent, withTrace,
} from "@buildflow/observability/logger";

const TRACE_RE = /^[a-zA-Z0-9._:-]{8,128}$/;

export function requestTraceId(request: Request): string {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && TRACE_RE.test(supplied) ? supplied : newId();
}

export function requestIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export async function tracedRoute(
  request: Request, route: string, handler: () => Promise<Response>,
): Promise<Response> {
  const traceId = requestTraceId(request);
  const started = performance.now();
  return withTrace(traceId, async () => {
    try {
      const response = await handler();
      response.headers.set("x-trace-id", traceId);
      logEvent(response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info", "request.completed", {
        traceId, route, method: request.method, status: response.status,
        durationMs: Math.round(performance.now() - started),
      });
      return response;
    } catch (error) {
      console.error("[Full Error] request.failed:", error);
      logEvent("error", "request.failed", {
        traceId, route, method: request.method, status: 500,
        durationMs: Math.round(performance.now() - started), errorCategory: errorCategory(error),
      });
      return NextResponse.json(
        { type: "about:blank", title: "Internal server error", status: 500, traceId },
        { status: 500, headers: { "content-type": "application/problem+json", "x-trace-id": traceId } },
      );
    }
  });
}

export async function rateLimitResponse(db: AppDb, request: Request, input: {
  scope: string; key?: string; limit: number; windowMs: number;
}): Promise<NextResponse | null> {
  const result = await consumeRateLimit(db, {
    scope: input.scope, key: input.key ?? requestIp(request),
    limit: input.limit, windowMs: input.windowMs,
  });
  if (result.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
  return NextResponse.json(
    { type: "about:blank", title: "Too many requests", status: 429, detail: "Wait before trying again." },
    { status: 429, headers: { "content-type": "application/problem+json", "retry-after": String(retryAfter) } },
  );
}
