# MVP acceptance scenarios — verification record

**Run date:** 2026-07-19
**Candidate:** Phase F working tree
**Rule:** “Verified” means executable evidence exists in this repository. A physical-device
field pilot and managed-service smoke remain deployment gates, not substitutes for these
deterministic checks.

| # | Scenario | Executable evidence | Status |
|---|---|---|---|
| 1 | Owner creates organization, project and team | `registration.spec.ts`; `registration-core.test.ts`; admin invitation acceptance test | verified |
| 2 | Offline DPR survives restart/reconnect and syncs without duplicates | mobile sync engine 14-test suite; `sync-core.test.ts` full manifest/upload/finalize replay | verified (automated) |
| 3 | AI produces structured draft with evidence references | pipeline schema-valid processing tests; DPR browser flow review assertions | verified |
| 4 | Manager corrects, approves and issues immutable PDF | review decision/revision tests; `dpr-flow.spec.ts`; issued-PDF retrieval | verified |
| 5 | Client opens only an authorized client-safe report | client-link issue/expiry/revocation/scope tests; public route authorization | verified |
| 6 | Cross-org user cannot access records or attachments | cross-tenant security suite, per-module denials and FORCE-RLS test | verified |
| 7 | Challan photo becomes reviewed receipt and updates inventory once | materials OCR/review/post tests and unique ledger source constraint | verified |
| 8 | Reviewed invoice appears in project cost reporting | invoice review/approval and exactly-once cost-entry tests; budget rollup tests | verified |
| 9 | QS verifies measured work with immutable correction history | MB state/capability/calculation/correction/export tests | verified |
| 10 | Manager creates RFQ and authorized user approves PO draft | procurement capability, comparison, approval and stamped export tests | verified |
| 11 | Labour/equipment logs feed project operational views | labour productivity and equipment usage/reminder query suites; project tabs | verified |
| 12 | Approved DPR links progress evidence without inventing percentage | controls test rejects drafts and proves link does not set progress | verified |
| 13 | Executive traces dashboard warnings to source records | portfolio aggregation/membership tests; source-linked exception UI | verified |
| 14 | Assistant cites records and refuses insufficient evidence | canonical-query, grounded fallback, scope/citation and refusal tests | verified |
| 15 | Compliance user sees gaps and exports versioned evidence pack | compliance template/evidence/review/export/checksum/cross-tenant tests | verified |
| 16 | Retry of upload, command or job never duplicates effects | offline replay suite; queue idempotency/backoff/dead-letter tests | verified |
| 17 | Issued, certified and approved records cannot be silently overwritten | issued revision, certified-MB correction and immutable budget tests | verified |
| 18 | Export/deletion honor retention and audit policy | lifecycle export, cascading retention and two-owner/grace deletion tests | verified |
| 19 | Web meets accessibility checks and reflows on mobile/desktop | axe WCAG A/AA scans, keyboard skip link, 320px no-overflow assertion | verified (automated) |
| 20 | Build, migrations, unit/integration and critical e2e pass | `pnpm verify:release`; PGlite migrations; release evidence record | local pass; real-PG gate open |

## Sign-off boundary

The 20 scenarios have deterministic implementation evidence. Engineering release sign-off
still requires the two environment-owned checks in `docs/RELEASE-EVIDENCE.md`:

1. migration `0000` through `0011` plus RLS verification on disposable real PostgreSQL;
2. live Supabase Storage upload/download signed-URL smoke in the approved India-region project.

A design-partner field exercise on a representative Android device remains required before a
customer production launch; automated restart/reflow coverage does not claim field adoption.
