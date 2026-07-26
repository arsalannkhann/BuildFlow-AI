# Multimodal Site Intelligence blueprint — reconciliation with BuildFlow AI

This maps the "Architectural Blueprint for Multimodal Site Intelligence" onto what BuildFlow AI
already does, what this change adds, and what remains as scoped follow-up work. The blueprint
describes, in large part, the product this repo already is; the honest task is closing the real
gaps, not rebuilding the foundation.

## Already implemented (blueprint → repo)

| Blueprint section | In this repo |
|---|---|
| §2 Machine-readable DPR schema | `packages/domain/src/dpr/schema.ts` — versioned `dpr.v1`: work items, labour, materials, equipment, safety/quality, blockers, weather, tomorrow's plan, each with `source_refs` + `confidence_band`. |
| §3.2 Image capture with spatial anchoring | Mobile capture (`apps/mobile`) with attachments; photo→work-item evidence linking (`packages/pipeline/src/photo-evidence.ts`). |
| §4 Zero-loss transmission, offline-first | Durable SQLite command queue + manifest/upload/finalize sync engine (`apps/mobile`, `sync-core`); transactional outbox + DB job queue with retry/backoff/dead-letter (ADR-0003). |
| §5 Code-mixed ASR | `TranscriptionPort` with Gemini; the whole entity-resolution layer is built for Hinglish/Hindi/English (`docs/ENTITY-RESOLUTION.md`), scored by a 41-fixture eval suite (`packages/ai/evals`). |
| §6 Deterministic structured extraction | `ExtractionPort` output is validated against the versioned `dprSchema` (zod) regardless of provider — the central never-invent gate (rules.md §11). §6.2 project-context RAG is the resolution cascade against the project's own records. |
| §7 Multimodal validation / visual grounding | Photo→work-item linking with a hard boundary: a photo is evidence for an existing claim and can never set a quantity or progress figure (`PhotoTaggingPort`). |
| §8.1 Schema/type validation | `runDeterministicValidations` + verified quote anchors + audio-quality signals (`packages/domain/src/dpr/validate.ts`). |
| §8.3 Human-in-the-loop | Review → approve → issue lifecycle; AI can never approve or issue (memory.md decision, 2026-07-13). |
| §9 Commercial artifacts | Issued DPR PDF (client/internal variants), e-MB preview, procurement/RA-bill scaffolding, portfolio dashboard. |

## Added by this change (the real gap: §2 contract schema + §8.2 consistency)

The blueprint's **Tier-2 logical consistency engine (§8.2)** and the **contractual fields it
needs (§2)** were the highest-value missing pieces: deterministic, testable, and directly tied to
commercial outcomes (claims, RA bills, revenue leakage). A report can be schema-perfect and still
be commercially wrong, and nothing was catching that.

**Schema (`dpr.v1`, additive & optional — no migration; `structuredData` is jsonb):**
- `environmental_conditions[]` — weather at fixed times (`time_label`, `temperature_c`,
  `wind_beaufort` 0–12, `rainfall_mm`, `impact_on_work`). NEC4 Clause 60.1(13) needs the readings,
  not the adjective.
- equipment `active_hours` / `idle_hours` / `idle_reason` — plant standing time is recoverable
  cost only when the cause is on record.

Both optional, so every previously issued record still validates (same discipline as the earlier
`quote` addition).

**Consistency engine (`packages/domain/src/dpr/consistency.ts`)** — pure, deterministic, seeded
by the site vocabulary. Every finding is a *question* for the reviewer, never a verdict; it never
edits or rejects the report (rules.md §11, blueprint Tier-3 HITL):

| Rule | Catches |
|---|---|
| `concrete_without_binder` | A pour reported with no cement/ready-mix in materials — over-claim or a missing Goods-Received entry. |
| `idle_plant_without_reason` | Idle plant with a blank reason — standing-time cost the claim cannot ask for. |
| `plant_hours_exceed_day` | active + idle > 24h — a units slip or double-count before it reaches a productivity report. |
| `adverse_weather_without_measurement` | Adverse weather claimed with no measured reading — an un-priceable NEC4 compensation event. |
| `equipment_recovered_without_repair_note` | A machine down yesterday running today with no repair noted (cross-day, uses `previousReportData`). |
| `work_without_resources` | Physical progress with zero labour and zero plant recorded — almost always an omission. |

Wired as a non-fatal pipeline stage (`checkConsistency`, after the revision exists so it can never
fail the run), surfaced on the review page (`ConsistencyPanel`) computed fresh from the current
revision, and carried in the `report.awaiting_review` notification so a reviewer sees the questions
before opening the draft. Audit records finding **codes only**, never content (rules.md §14).

Coverage: 14 engine tests, a `previousReportData` tenant-scoped query test, and a pipeline-stage
assertion.

## Scoped follow-ups (deliberately not in this change)

These are real, valuable, and larger than a single change — each needs infrastructure, a paid
service, or on-device native work, and several cannot be verified in this environment:

1. **Edge noise suppression (§3.1)** — RNNoise/DeepFilterNet compiled to ONNX, running in the Expo
   app before upload. Native mobile ML work; belongs behind the existing audio-capture path so the
   pipeline is unchanged. Biggest single quality lever for real field audio.
2. **On-device image quality + forced EXIF (§3.2)** — OpenCV Laplacian-variance blur check and
   mandatory GPS/orientation EXIF at capture time, with immediate retake prompts. Mobile-native.
3. **TUS resumable-upload protocol (§4.2)** — the repo already has a resumable manifest/upload
   flow; adopting TUS specifically means a `tusd` server + client and is an infrastructure change,
   not a code refactor. Worth doing only if the current flow proves insufficient in the field.
4. **Sarvam AI ASR provider (§5.2)** — a clean `TranscriptionPort` implementation for Indic
   code-mixing, requested via the "Normalized Code-Mixed" format. Ready to add behind the port;
   needs a Sarvam API key and live evaluation against consented field audio (roadmap R1) before it
   can be the default. Provide the key and this is a contained addition.
5. **LMM visual grounding — Set-of-Mark / MRVG / DefectBench (§7)** — the current photo tagging is
   deliberately simple (evidence-only). Full defect segmentation and audio-vs-image discrepancy
   detection (e.g. "audio says 25 rebar workers, the photo shows 6") is a substantial model and
   evaluation effort, and must keep the same hard boundary: a visual estimate is a flag for review,
   never a fact written to the record.
6. **Automated MPR / RA-bill / EWN generation (§9)** — partially present (issued PDF, e-MB); full
   contract-document generation from the verified JSON is its own workstream.

## Why this slice, and why not the rest, right now

The consistency engine is the blueprint's thesis — *"ensuring completeness"* and *"the automated
validation engine"* — expressed as deterministic, unit-tested domain logic that fits the existing
never-invent, human-in-the-loop architecture and delivers immediate commercial value. The scoped
items are genuinely valuable but are infra-heavy, need external services/keys, or are native-mobile
ML that cannot be built and verified end-to-end in one change. They are listed here so the boundary
is explicit rather than implied.
