import type { ExtractionPort } from "../ports";
import { DPR_SCHEMA_VERSION, type DprStructuredData } from "@buildflow/domain/dpr/schema";

export class MockExtraction implements ExtractionPort {
  readonly meta = { provider: "mock", model: "mock-extract-1", promptVersion: "dpr-extraction.v1" };

  async extract(_input: { transcript: unknown }): Promise<DprStructuredData> {
    return {
      schema_version: DPR_SCHEMA_VERSION,
      work_items: [{
        description: "Casting of column C4", location: "Tower A / Level 3", activity: "RCC",
        quantity: { value: "2.5", unit: "cum" },
        source_refs: [{ transcript_span: { startMs: 1000, endMs: 6000 } }],
        confidence_band: "Supported",
      }],
      labour: [
        { trade: "mason", count: 6, source_refs: [{ transcript_span: { startMs: 6000, endMs: 9000 } }], confidence_band: "Supported" },
        { trade: "helper", count: 4, source_refs: [{ transcript_span: { startMs: 6000, endMs: 9000 } }], confidence_band: "Supported" },
      ],
      materials: [{
        name: "cement", status: "delayed", quantity: null, unit: null,
        source_refs: [{ transcript_span: { startMs: 9000, endMs: 11000 } }], confidence_band: "Check",
      }],
      equipment: [],
      safety_quality: [],
      blockers: [{
        description: "Cement delivery delayed", cause: null, owner: null, expected_resolution: null,
        source_refs: [{ transcript_span: { startMs: 9000, endMs: 11000 } }], confidence_band: "Check",
      }],
      weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" },
      tomorrow_plan: [{
        item: "Slab shuttering", source_refs: [{ transcript_span: { startMs: 11000, endMs: 14000 } }],
        confidence_band: "Supported",
      }],
    };
  }
}
