import { z } from "zod";

// Stays "dpr.v1": `quote` was added as an OPTIONAL field, so every historical revision
// still validates. Bumping the literal would make previously issued records unreadable.
// The behavioural change is tracked by the prompt version instead (rules.md §11).
export const DPR_SCHEMA_VERSION = "dpr.v1" as const;

export const confidenceBand = z.enum(["Supported", "Check", "Missing"]);
export type ConfidenceBand = z.infer<typeof confidenceBand>;

export const sourceRef = z.object({
  /**
   * Verbatim words from the transcript that support the claim. Unlike `transcript_span`,
   * a quote is SELF-VERIFYING: the server checks it really occurs in the transcript and
   * drops it when it does not (see validate.ts). Prefer this as the evidence anchor.
   */
  quote: z.string().optional(),
  /**
   * Approximate audio offsets. NOTE: when the transcription provider is a multimodal LLM
   * these are model-generated numbers, not measurements from the waveform — treat them as
   * a navigation hint, never as proof. Real offsets require an ASR provider that emits
   * word timings.
   */
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
    name: z.string(), status: z.enum(["used", "unavailable"]).nullable(),
    // Plant standing time is a primary source of recoverable cost on employer-driven delays
    // (blueprint §2). Optional so `dpr.v1` stays valid for records captured before this field
    // existed; only ever populated when the engineer actually states the hours.
    active_hours: z.number().min(0).max(24).nullable().optional(),
    idle_hours: z.number().min(0).max(24).nullable().optional(),
    idle_reason: z.string().nullable().optional(),
    ...base,
  })),
  safety_quality: z.array(z.object({ note: z.string(), ...base })),
  blockers: z.array(z.object({
    description: z.string(), cause: z.string().nullable(), owner: z.string().nullable(),
    expected_resolution: z.string().nullable(), ...base,
  })),
  weather_site_condition: z.object({ value: z.string().nullable(), ...base }),
  /**
   * Weather measured at fixed intervals (blueprint §2, NEC4 Clause 60.1(13)). A single
   * "bad weather today" cannot price an adverse-weather compensation event; the quantitative
   * readings at fixed times can. Optional and additive: absent on older records, and only
   * populated from what the engineer actually reports — never invented (rules.md §11).
   */
  environmental_conditions: z.array(z.object({
    time_label: z.string(),                                   // "07:00", "12:00", "17:00", or free
    temperature_c: z.number().nullable(),
    wind_beaufort: z.number().int().min(0).max(12).nullable(),
    rainfall_mm: z.number().min(0).nullable(),
    impact_on_work: z.boolean().nullable(),
    ...base,
  })).optional(),
  tomorrow_plan: z.array(z.object({ item: z.string(), ...base })),
});
export type DprStructuredData = z.infer<typeof dprSchema>;
