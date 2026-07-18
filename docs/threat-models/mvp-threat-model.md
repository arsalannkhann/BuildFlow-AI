# BuildFlow AI — MVP threat model

**Date:** 2026-07-19 · **Scope:** web app, /v1 API, mobile sync, workers, storage, AI
pipeline, client links, invitations. **Method:** STRIDE per trust boundary. Mitigations
reference the code that implements them; open items carry a phase tag.

## Trust boundaries

1. Internet → web/app API (session cookie or bearer token)
2. Internet → public token routes (`/invite/[token]`, `/r/[token]`)
3. App → PostgreSQL (tenant boundary inside one database)
4. App/worker → object storage
5. App/worker → AI providers (untrusted *content* flows both directions)
6. Mobile device (hostile-environment client) → API

## Assets

Tenant project records and evidence (audio/photos/documents), credentials and sessions,
invitation/client-link tokens, provider API keys, audit trail integrity, issued-document
immutability.

## Threats and mitigations

### Spoofing / authentication
- Credential stuffing / weak passwords → scrypt (N=2^15) hashing, timing-safe dummy-hash
  verification for unknown emails (`packages/auth/src/dev.ts`), min-length on accept.
  **Open (F):** rate limiting on login and token endpoints; account lockout/backoff.
- Session theft → opaque 256-bit tokens, only SHA-256 hashes stored; httpOnly SameSite=Lax
  cookies, `secure` in production; server-side expiry + logout deletion.
- Invitation/client-link forgery → 256-bit random tokens, hash-only storage, expiry,
  single-use (invitations) / revocation (client links); constant lookup by hash.

### Tampering
- Cross-tenant writes → explicit `TenantContext` on every query; PostgreSQL FORCE RLS
  policies on all tenant tables keyed to a transaction-local GUC (`0002/0003` migrations),
  verified by hermetic tests; `WITH CHECK` blocks cross-org inserts.
- Issued-record mutation → append-only issued_documents with unique (report, version),
  supersession links; revisions append-only with unique (report, revision_number);
  state machine forbids edits after approval (`review-core`).
- Upload substitution → client-declared SHA-256 verified server-side on every byte stream;
  immutable object keys (put-once storage); size/type limits per kind.
- Audit-trail tampering → append-only audit_event; **Open (F):** restrict UPDATE/DELETE
  grants on audit tables for the app role in a hardening migration.

### Repudiation
- Every approval, issuance, member change, share, and field decision writes an audit_event
  with actor id; review_decision keeps before/after values.

### Information disclosure
- Client links → resolve only issued, client-safe content; internal notes/confidence bands
  never rendered on `/r/[token]`; access + downloads audited.
- Object keys are opaque (no names/narrative); evidence served through authenticated
  routes only. **Open (B/F):** move to short-lived signed URLs when the cloud storage
  adapter lands.
- Logs/telemetry → rules.md §16 forbids content in logs; worker logs errors only.
  **Open (F):** structured logging conventions + lint for accidental content logging.
- Search leakage → tenant filter applied in SQL before ranking (`queries/search.ts`);
  drafts excluded from the index queryside.

### Denial of service
- Upload floods → per-kind size caps in sync-core. **Open (F):** rate limits by identity/
  IP, request-size middleware, queue depth alarms.
- Job poisoning → bounded attempts with exponential backoff → dead-letter state; unknown
  job kinds parked dead immediately.

### Elevation of privilege
- UI-only gating → every server action/route re-checks capabilities (assertCan) and
  tenant scope; tests cover engineer-cannot-approve, non-member-cannot-manifest, etc.
- Role tampering → roles resolve to capability snapshots server-side; unknown stored
  capability strings dropped on context resolution.
- Prompt injection via transcripts/documents → AI output must validate against strict
  zod schemas; unsupported values null; AI cannot trigger side effects (draft-only);
  PDF template HTML-escapes all interpolated content. **Open (D):** treat OCR text as
  untrusted on the same terms; keep provider calls schema-constrained.

## Mobile-specific

Device loss → session token in SecureStore (Keychain/Keystore); local drafts contain site
data — **Open (F):** SQLCipher for the local database per Architecture.MD. Sync replay is
safe by construction (idempotent manifest/upload/finalize).

## Residual-risk register (accepted for MVP, revisit at Phase F gate)

| Risk | Acceptance rationale |
|---|---|
| App connects as table-owner role in PGlite/dev (RLS bypass in app path) | RLS verified via SET ROLE tests; production guidance: connect as `buildflow_app` (no BYPASSRLS) |
| Invite/client tokens appear once in URLs shown to the authorized creator | Replaced by email/WhatsApp delivery in Phase E |
| No malware scanning of uploads yet | Integration point reserved in upload validation; Phase F |
| Login lacks rate limiting locally | Phase F hardening with deployment-level limits |
