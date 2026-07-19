# MVP acceptance scenarios — verification record

Each scenario below must be demonstrated against the running product before the MVP is
called complete (brief §"Required end-to-end acceptance scenarios"). Record HOW it was
verified (test name, e2e spec, or manual walkthrough with date) — no checkbox without
evidence.

| # | Scenario | Verified by | Status |
|---|---|---|---|
| 1 | Org owner creates organization, project, team | | pending |
| 2 | Engineer creates DPR offline (voice+photos), app restart, reconnect, sync — no duplicates | mobile sync-engine suite (restart/replay tests) + manual device walkthrough | partial |
| 3 | AI produces structured draft with evidence references | pipeline tests (schema-valid revision, source refs) + e2e | partial |
| 4 | Manager corrects, approves, issues immutable PDF | e2e dpr-flow + review field-decision tests | partial |
| 5 | Client opens only the authorized client-safe report | client-link tests (expiry, revocation, scope) | partial |
| 6 | Cross-org user cannot access any record or attachment | cross-tenant suites + RLS tests | partial |
| 7 | Challan photo → reviewed receipt lines → inventory updated exactly once | | pending |
| 8 | Invoice reviewed → reflected in project cost reporting | | pending |
| 9 | QS submits and verifies measured-work entry; immutable correction history | | pending |
| 10 | Manager creates RFQ; authorized user approves PO draft | | pending |
| 11 | Labour and equipment logs appear in daily project overview | | pending |
| 12 | Approved DPR updates linked activity progress without inventing a percentage | controls-core test (evidence-linked progress, link ≠ percent) | partial |
| 13 | Executive traces every dashboard warning to source records | | pending |
| 14 | Assistant answers with citations; refuses on insufficient evidence | | pending |
| 15 | Compliance user exports versioned evidence pack, sees missing requirements | | pending |
| 16 | Retrying upload/command/job never duplicates | sync-core replay test + jobs idempotency tests | partial |
| 17 | Issued reports, certified measurements, approved financials cannot be silently overwritten | immutability tests (issue supersession; MB certification pending) | partial |
| 18 | Export/deletion respect retention and audit policy | | pending |
| 19 | Web meets accessibility checks; works mobile + desktop | | pending |
| 20 | Build, migrations, unit, integration, critical e2e all pass | CI + local gates (continuously) | partial |

"partial" = automated coverage exists but the end-to-end walkthrough (and any missing
module dependency) is still owed. Final sign-off happens in Phase F.
