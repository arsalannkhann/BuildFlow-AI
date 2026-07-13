# BuildFlow — DPR vertical slice

A runnable end-to-end slice of the BuildFlow DPR workflow: capture (browser voice note +
photos) → transcribe → strict structured DPR extraction → manager review with evidence →
approve → issue a versioned, immutable PDF → retrieve it.

Built as a single Next.js app with hard internal boundaries (`src/domain`, `src/db`,
`src/ai`, `src/storage`, `src/pipeline`, `src/app`) so it extracts cleanly into the
monorepo/services described in `Architecture.MD` later. Runs with no external accounts.

See the design and plan:
- Spec: `docs/superpowers/specs/2026-07-13-buildflow-dpr-vertical-slice-design.md`
- Plan: `docs/superpowers/plans/2026-07-13-buildflow-dpr-vertical-slice.md`
- Deferred work: `docs/superpowers/DEFERRED.md`

## Prerequisites

- Node 20.
- pnpm 9 (via Corepack). This repo pins `packageManager` to `pnpm@9.15.9`; if `pnpm` is not
  on your PATH, run `corepack enable pnpm` (or `corepack prepare pnpm@9 --activate`).
  Note: pnpm 11 currently crashes on Node 20, so stay on pnpm 9.

## Run

```
pnpm install
pnpm exec playwright install chromium
cp .env.example .env.local   # defaults use the mock AI provider; no keys needed
pnpm dev
```

Open http://localhost:3000 → **Sign in** → **Continue as Site Engineer** → **Record update**
(record a short voice note, optionally add photos) → **Submit**. The mock pipeline runs and
the report reaches *Ready for manager review*. Then sign in again as **Project Manager**,
open the report, **Approve**, **Issue PDF**, and **Download** it.

Two seeded users (no real auth in this slice): a **Site Engineer** (create/review) and a
**Project Manager** (review/approve/issue), in one seeded org + project.

## Real AI (optional)

The transcription, extraction, and summary steps sit behind ports with a mock default. To
use OpenAI, set in `.env.local`:

```
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

The mock is the default so the whole flow runs offline.

## Test

```
pnpm test         # unit + integration (Vitest, PGlite-backed)
pnpm test:e2e     # Playwright happy path (capture → approve → issue → PDF)
pnpm typecheck    # tsc --noEmit
pnpm build        # production build
```

Note on `pnpm test:e2e`: on macOS, headless Chrome-for-Testing's microphone is gated by the
OS (TCC) in non-interactive runs, so the e2e injects a synthesized audio stream to stand in
for the OS audio *source* — the real MediaRecorder → upload → server action → pipeline path
is still exercised. On Linux CI the OS gate does not apply.

## Architecture notes

- `src/domain` is framework-free: the report state machine, the strict DPR Zod schema,
  deterministic validators, and tenant/capability policy. No React, no DB, no provider SDKs.
- `src/db` uses Drizzle over embedded PGlite (real Postgres semantics, zero external
  dependency). The same Drizzle layer repoints at Supabase/Postgres later. Every query
  requires an explicit `TenantContext` and filters by `organization_id`.
- `src/ai` and `src/storage` are ports with mock (default) and real implementations.
- `src/pipeline` runs the processing stages (validate → transcribe → extract → validate →
  summarize → create revision) in-process — a stand-in for the durable worker, structured so
  each stage is idempotent and maps onto Cloud Tasks later.
- Approve and issue are **separate**, capability-gated actions; issued PDFs are immutable and
  versioned; every mutation writes an audit event.
