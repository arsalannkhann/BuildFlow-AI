// /v1 API surface used by the sync engine. Pure TypeScript.
// Request/response shapes come from @buildflow/contracts (rules.md §3: never
// copy DTOs) and every server payload is runtime-validated before use.

import {
  createReportRequest,
  createReportResponse,
  finalizeReportResponse,
  problemDetails,
  type CreateReportRequest,
  type CreateReportResponse,
} from "@buildflow/contracts/v1";
import { z } from "zod";

export const apiPaths = {
  login: "/api/v1/auth/login",
  me: "/api/v1/me",
  reports: "/api/v1/reports",
  finalize: (reportId: string) => `/api/v1/reports/${reportId}/finalize`,
} as const;

export const uploadResponse = z.object({ uploaded: z.boolean() });

export { createReportRequest, createReportResponse, finalizeReportResponse };
export type { CreateReportRequest, CreateReportResponse };

/** Safe human-readable message out of a Problem Details body (RFC 9457). */
export function describeProblem(status: number, bodyText: string): string {
  try {
    const parsed = problemDetails.safeParse(JSON.parse(bodyText));
    if (parsed.success) {
      const { title, detail, traceId } = parsed.data;
      const base = detail ? `${title}: ${detail}` : title;
      return traceId ? `${base} (ref ${traceId})` : base;
    }
  } catch {
    // fall through — not JSON
  }
  return `HTTP ${status}`;
}

export function parseJson(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw new Error("Server returned a non-JSON response");
  }
}
