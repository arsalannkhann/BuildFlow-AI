// Thin /v1 client for the interactive screens (sign-in, /me, reports list).
// Report submission never goes through here — that is the sync engine's job.

import {
  listReportsResponse,
  loginResponse,
  meResponse,
  problemDetails,
} from "@buildflow/contracts/v1";
import { z } from "zod";
import { fetch as expoFetch } from "expo/fetch";
import { apiPaths } from "./sync/api";

export type LoginResult = z.infer<typeof loginResponse>;
export type Me = z.infer<typeof meResponse>;
export type ReportsPage = z.infer<typeof listReportsResponse>;
export type ServerReport = ReportsPage["reports"][number];

/** status === 0 means the server was unreachable (offline, DNS, timeout). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function requestJson(
  url: string,
  init: { method: "GET" | "POST"; token?: string; body?: unknown },
): Promise<unknown> {
  let response;
  try {
    response = await expoFetch(url, {
      method: init.method,
      headers: {
        "content-type": "application/json",
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch (error) {
    throw new ApiError(0, error instanceof Error ? error.message : "Network request failed");
  }
  const bodyText = await response.text();
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const problem = problemDetails.safeParse(JSON.parse(bodyText));
      if (problem.success) {
        message = problem.data.detail
          ? `${problem.data.title}: ${problem.data.detail}`
          : problem.data.title;
      }
    } catch {
      // keep generic message
    }
    throw new ApiError(response.status, message);
  }
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw new ApiError(response.status, "Server returned a non-JSON response");
  }
}

export async function login(
  baseUrl: string,
  email: string,
  password: string,
): Promise<LoginResult> {
  const body = await requestJson(`${baseUrl}${apiPaths.login}`, {
    method: "POST",
    body: { email, password },
  });
  return loginResponse.parse(body);
}

export async function fetchMe(baseUrl: string, token: string): Promise<Me> {
  const body = await requestJson(`${baseUrl}${apiPaths.me}`, { method: "GET", token });
  return meResponse.parse(body);
}

export async function fetchReports(
  baseUrl: string,
  token: string,
  options?: { projectId?: string; cursor?: string },
): Promise<ReportsPage> {
  const query = new URLSearchParams();
  if (options?.projectId) query.set("projectId", options.projectId);
  if (options?.cursor) query.set("cursor", options.cursor);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const body = await requestJson(`${baseUrl}${apiPaths.reports}${suffix}`, {
    method: "GET",
    token,
  });
  return listReportsResponse.parse(body);
}
