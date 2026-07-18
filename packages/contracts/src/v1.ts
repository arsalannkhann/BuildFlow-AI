import { z } from "zod";
import { ROLES } from "@buildflow/domain/tenancy";
import { REPORT_STATUSES } from "@buildflow/domain/report/state";

// /v1 API contracts consumed by the mobile app and external integrations.
// Breaking changes require a new version (Architecture.MD §14).

export const loginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export const loginResponse = z.object({
  token: z.string(),
  userId: z.string(),
  expiresAt: z.string(), // ISO 8601
});

export const meResponse = z.object({
  userId: z.string(),
  displayName: z.string(),
  email: z.string().nullable(),
  organizationId: z.string(),
  organizationName: z.string(),
  projects: z.array(z.object({
    id: z.string(),
    name: z.string(),
    role: z.enum(ROLES).nullable(),
    timezone: z.string(),
    clientName: z.string().nullable(),
  })),
});

export const projectReferenceResponse = z.object({
  locations: z.array(z.object({
    id: z.string(), parentId: z.string().nullable(), kind: z.string(), name: z.string(),
  })),
  activities: z.array(z.object({
    id: z.string(), name: z.string(), unit: z.string().nullable(), locationId: z.string().nullable(),
  })),
});

export const attachmentManifestItem = z.object({
  clientAttachmentId: z.string().min(1).max(128),
  kind: z.enum(["audio", "photo", "document"]),
  contentType: z.string().min(1),
  byteSize: z.number().int().positive(),
  checksum: z.string().length(64), // sha256 hex, computed on device
  capturedAt: z.string().datetime({ offset: true }).optional(),
});

export const createReportRequest = z.object({
  clientReportId: z.string().min(1).max(128),
  projectId: z.string().min(1),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(2000).optional(),
  attachments: z.array(attachmentManifestItem).max(40),
});
export const createReportResponse = z.object({
  reportId: z.string(),
  status: z.enum(REPORT_STATUSES),
  attachments: z.array(z.object({
    clientAttachmentId: z.string(),
    attachmentId: z.string(),
    uploaded: z.boolean(),
    // Server-proxied upload today; becomes a signed object-storage URL later without a
    // contract change.
    uploadUrl: z.string(),
  })),
});

export const finalizeReportResponse = z.object({
  reportId: z.string(),
  status: z.enum(REPORT_STATUSES),
});

export const reportSummary = z.object({
  id: z.string(),
  projectId: z.string(),
  reportDate: z.string(),
  status: z.enum(REPORT_STATUSES),
  note: z.string().nullable(),
  createdAt: z.string(),
  summaryInternal: z.string().nullable().optional(),
});
export const listReportsResponse = z.object({
  reports: z.array(reportSummary),
  nextCursor: z.string().nullable(),
});

export const problemDetails = z.object({
  type: z.string().default("about:blank"),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  traceId: z.string().optional(),
});

export type LoginRequest = z.infer<typeof loginRequest>;
export type CreateReportRequest = z.infer<typeof createReportRequest>;
export type CreateReportResponse = z.infer<typeof createReportResponse>;
export type MeResponse = z.infer<typeof meResponse>;
