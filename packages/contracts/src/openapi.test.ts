import { expect, test } from "vitest";
import { openApiV1 } from "./openapi";

test("OpenAPI v1 covers every mobile sync route and problem responses carry trace ids", () => {
  expect(openApiV1.openapi).toBe("3.1.0");
  expect(Object.keys(openApiV1.paths)).toEqual(expect.arrayContaining([
    "/api/v1/auth/login", "/api/v1/me", "/api/v1/reports",
    "/api/v1/reports/{reportId}/attachments/{attachmentId}/content",
    "/api/v1/reports/{reportId}/finalize",
  ]));
  expect(openApiV1.components.schemas.Problem.required).toContain("traceId");
  expect(openApiV1.security).toEqual([{ bearerAuth: [] }]);
});
