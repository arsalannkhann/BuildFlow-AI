import { z } from "zod";

export const DPR_SCHEMA_VERSION = "dpr.v1" as const;

export const confidenceBand = z.enum(["Supported", "Check", "Missing"]);
export type ConfidenceBand = z.infer<typeof confidenceBand>;

export const sourceRef = z.object({
  transcript_span: z.object({ startMs: z.number(), endMs: z.number() }).optional(),
  attachment_id: z.string().optional(),
});
export type SourceRef = z.infer<typeof sourceRef>;

const base = { source_refs: z.array(sourceRef), confidence_band: confidenceBand };
const quantity = z.object({ value: z.string().nullable(), unit: z.string().nullable() });

export const dprSchema = z.object({
  schema_version: z.literal(DPR_SCHEMA_VERSION),
  work_items: z.array(z.object({
    description: z.string(), location: z.string().nullable(), activity: z.string().nullable(),
    quantity, ...base,
  })),
  labour: z.array(z.object({ trade: z.string(), count: z.number().nullable(), ...base })),
  materials: z.array(z.object({
    name: z.string(),
    status: z.enum(["received", "used", "delayed", "required"]).nullable(),
    quantity: quantity.nullable(), unit: z.string().nullable(), ...base,
  })),
  equipment: z.array(z.object({
    name: z.string(), status: z.enum(["used", "unavailable"]).nullable(), ...base,
  })),
  safety_quality: z.array(z.object({ note: z.string(), ...base })),
  blockers: z.array(z.object({
    description: z.string(), cause: z.string().nullable(), owner: z.string().nullable(),
    expected_resolution: z.string().nullable(), ...base,
  })),
  weather_site_condition: z.object({ value: z.string().nullable(), ...base }),
  tomorrow_plan: z.array(z.object({ item: z.string(), ...base })),
});
export type DprStructuredData = z.infer<typeof dprSchema>;
