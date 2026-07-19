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
  Distributed fixed-window throttles now cover web/API login, invitation acceptance,
  bearer API traffic, uploads and public client links. Raw IP/email/token values are hashed
  before counter storage; 429 responses carry `Retry-After`.
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
- Audit-trail tampering → append-only audit_event; migration 0011 revokes UPDATE/DELETE on
  the audit table from `buildflow_app`.

### Repudiation
- Every approval, issuance, member change, share, and field decision writes an audit_event
  with actor id; review_decision keeps before/after values.

### Information disclosure
- Client links → resolve only issued, client-safe content; internal notes/confidence bands
  never rendered on `/r/[token]`; access + downloads audited.
- Object keys are opaque (no names/narrative); local evidence is served through authenticated
  routes. Supabase private storage produces download links bounded to at most one hour;
  organization exports use five-minute links and audit link creation.
- Logs/telemetry → a shared structured logger accepts a closed set of ID/state/timing fields;
  request/job events carry trace IDs and categorized errors, never bodies, payloads or raw
  error messages. Provider health is computed from content-free database fields.
- Search leakage → tenant filter applied in SQL before ranking (`queries/search.ts`);
  drafts excluded from the index queryside.

### Denial of service
- Upload floods → per-kind and aggregate size caps in web/mobile sync, a 100 MB route ceiling,
  user/API throttles, bounded queue attempts and a surfaced dead-letter/stuck-processing view.
- Job poisoning → bounded attempts with exponential backoff → dead-letter state; unknown
  job kinds parked dead immediately.

### Elevation of privilege
- UI-only gating → every server action/route re-checks capabilities (assertCan) and
  tenant scope; tests cover engineer-cannot-approve, non-member-cannot-manifest, etc.
- Role tampering → roles resolve to capability snapshots server-side; unknown stored
  capability strings dropped on context resolution.
- Prompt injection via transcripts/documents → AI output must validate against strict
  zod schemas; unsupported values null; AI cannot trigger side effects (draft-only);
  PDF template HTML-escapes all interpolated content. OCR text is treated as untrusted,
  schema-constrained input and can populate draft rows only.

## Mobile-specific

Device loss → session token in SecureStore (Keychain/Keystore); local drafts contain site
data. Device encryption/passcode is required for pilots; independent SQLCipher encryption is
the explicit residual risk below. Sync replay is safe by construction.

## Phase F delta review

- Organization lifecycle adds high-impact export/retention/deletion paths. Export requires
  `org.export`; retention is system-scheduled; deletion requires `org.manage`, a distinct
  second owner, seven-day grace, production HMAC receipt key and revalidation at execution.
- Storage selection now fails on partially configured Supabase variables. Local keys reject
  absolute/traversal paths; cloud uploads are immutable (`upsert: false`).
- Request isolation now sets the transaction-local tenant GUC on all `/api/v1` data paths.
  RLS policy and migration verification remain release gates against real PostgreSQL.
- New residual risk: signed Supabase URLs cannot be revoked individually before expiry. MVP
  bounds export links to five minutes and audits creation; urgent revocation requires object
  deletion/provider response.

## Residual-risk register (accepted for MVP, revisit at Phase F gate)

| Risk | Acceptance rationale |
|---|---|
| App connects as table-owner role in PGlite/dev (RLS bypass in app path) | RLS verified via SET ROLE tests; production guidance: connect as `buildflow_app` (no BYPASSRLS) |
| Invite/client tokens appear once in URLs shown to the authorized creator | Replaced by email/WhatsApp delivery in Phase E |
| Expo SQLite is not encrypted independently of device encryption | Accepted for pilot devices with OS passcode/managed-device policy; SQLCipher remains a post-MVP security milestone |
| No malware scanning of uploads | Files are private, size/type bounded and never executed; add scanning before accepting untrusted external uploads |
| Supabase signed URL cannot be revoked before expiry | Export URLs expire in five minutes; delete the object for emergency revocation |
