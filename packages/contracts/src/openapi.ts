const problem = {
  description: "Problem details",
  content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
};

export const openApiV1 = {
  openapi: "3.1.0",
  info: {
    title: "BuildFlow mobile sync API", version: "1.0.0",
    description: "Stable, tenant-scoped API used by the offline-first field application.",
  },
  servers: [{ url: "/" }],
  tags: [{ name: "Authentication" }, { name: "Projects" }, { name: "Reports" }],
  paths: {
    "/api/v1/auth/login": { post: {
      tags: ["Authentication"], operationId: "login", security: [],
      requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } } },
      responses: { "200": { description: "Authenticated", content: { "application/json": { schema: { $ref: "#/components/schemas/LoginResponse" } } } }, "400": problem, "401": problem, "429": problem },
    } },
    "/api/v1/auth/logout": { post: {
      tags: ["Authentication"], operationId: "logout", responses: { "204": { description: "Signed out" }, "401": problem },
    } },
    "/api/v1/me": { get: {
      tags: ["Authentication"], operationId: "me", responses: { "200": { description: "Current identity and project access", content: { "application/json": { schema: { $ref: "#/components/schemas/Me" } } } }, "401": problem, "429": problem },
    } },
    "/api/v1/projects/{projectId}/reference": { get: {
      tags: ["Projects"], operationId: "projectReference", parameters: [{ $ref: "#/components/parameters/ProjectId" }],
      responses: {
        "200": { description: "Capture reference data", content: { "application/json": { schema: {
          type: "object", required: ["locations", "activities"], properties: {
            locations: { type: "array", items: { $ref: "#/components/schemas/ReferenceItem" } },
            activities: { type: "array", items: { $ref: "#/components/schemas/ReferenceItem" } },
          },
        } } } },
        "403": problem, "404": problem,
      },
    } },
    "/api/v1/reports": {
      get: { tags: ["Reports"], operationId: "listReports", responses: {
        "200": { description: "Reports visible to the user", content: { "application/json": { schema: {
          type: "object", required: ["reports"], properties: {
            reports: { type: "array", items: { $ref: "#/components/schemas/Report" } },
          },
        } } } },
        "401": problem, "429": problem,
      } },
      post: { tags: ["Reports"], operationId: "createReportManifest", parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateReportRequest" } } } }, responses: { "201": { description: "Manifest created", content: { "application/json": { schema: { $ref: "#/components/schemas/CreateReportResponse" } } } }, "400": problem, "403": problem, "409": problem, "429": problem } },
    },
    "/api/v1/reports/{reportId}": { get: {
      tags: ["Reports"], operationId: "getReport", parameters: [{ $ref: "#/components/parameters/ReportId" }],
      responses: { "200": { description: "Report sync state", content: { "application/json": { schema: { $ref: "#/components/schemas/Report" } } } }, "403": problem, "404": problem },
    } },
    "/api/v1/reports/{reportId}/attachments/{attachmentId}/content": { put: {
      tags: ["Reports"], operationId: "uploadAttachment", parameters: [{ $ref: "#/components/parameters/ReportId" }, { $ref: "#/components/parameters/AttachmentId" }, { $ref: "#/components/parameters/IdempotencyKey" }],
      requestBody: { required: true, content: { "application/octet-stream": { schema: { type: "string", contentEncoding: "binary" } } } },
      responses: { "204": { description: "Stored and checksum verified" }, "400": problem, "403": problem, "404": problem, "409": problem, "413": problem, "429": problem },
    } },
    "/api/v1/reports/{reportId}/finalize": { post: {
      tags: ["Reports"], operationId: "finalizeReport", parameters: [{ $ref: "#/components/parameters/ReportId" }, { $ref: "#/components/parameters/IdempotencyKey" }],
      responses: {
        "200": { description: "Processing accepted", content: { "application/json": { schema: {
          type: "object", required: ["reportId", "status"], properties: {
            reportId: { type: "string" }, status: { type: "string" },
          },
        } } } },
        "403": problem, "404": problem, "409": problem,
      },
    } },
  },
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque" } },
    parameters: {
      ProjectId: { name: "projectId", in: "path", required: true, schema: { type: "string" } },
      ReportId: { name: "reportId", in: "path", required: true, schema: { type: "string" } },
      AttachmentId: { name: "attachmentId", in: "path", required: true, schema: { type: "string" } },
      IdempotencyKey: { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", maxLength: 200 } },
    },
    schemas: {
      LoginRequest: { type: "object", required: ["email", "password"], additionalProperties: false, properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 } } },
      LoginResponse: { type: "object", required: ["token", "expiresAt"], properties: { token: { type: "string" }, expiresAt: { type: "string", format: "date-time" } } },
      Me: { type: "object", required: ["userId", "organizationId", "projects"], properties: { userId: { type: "string" }, organizationId: { type: "string" }, projects: { type: "array", items: { type: "object", required: ["id", "name", "timezone"], properties: { id: { type: "string" }, name: { type: "string" }, timezone: { type: "string" } } } } } },
      ReferenceItem: { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" }, parentId: { type: ["string", "null"] }, unit: { type: ["string", "null"] } } },
      AttachmentManifest: { type: "object", required: ["clientAttachmentId", "kind", "contentType", "byteSize", "checksum"], properties: { clientAttachmentId: { type: "string" }, kind: { enum: ["audio", "photo"] }, contentType: { type: "string" }, byteSize: { type: "integer", minimum: 1, maximum: 104857600 }, checksum: { type: "string", pattern: "^[a-f0-9]{64}$" }, capturedAt: { type: ["string", "null"], format: "date-time" } } },
      CreateReportRequest: { type: "object", required: ["clientReportId", "projectId", "reportDate", "attachments"], additionalProperties: false, properties: { clientReportId: { type: "string" }, projectId: { type: "string" }, reportDate: { type: "string", format: "date" }, note: { type: ["string", "null"], maxLength: 5000 }, attachments: { type: "array", minItems: 1, maxItems: 21, items: { $ref: "#/components/schemas/AttachmentManifest" } } } },
      CreateReportResponse: { type: "object", required: ["reportId", "status", "attachments"], properties: { reportId: { type: "string" }, status: { type: "string" }, attachments: { type: "array", items: { type: "object", required: ["id", "clientAttachmentId", "uploaded"], properties: { id: { type: "string" }, clientAttachmentId: { type: "string" }, uploaded: { type: "boolean" } } } } } },
      Report: { type: "object", required: ["id", "projectId", "reportDate", "status"], properties: { id: { type: "string" }, projectId: { type: "string" }, reportDate: { type: "string", format: "date" }, status: { type: "string" }, updatedAt: { type: "string", format: "date-time" } } },
      Problem: { type: "object", required: ["type", "title", "status", "traceId"], properties: { type: { type: "string" }, title: { type: "string" }, status: { type: "integer" }, detail: { type: "string" }, traceId: { type: "string" } } },
    },
  },
} as const;
