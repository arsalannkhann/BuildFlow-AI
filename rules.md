# BuildFlow AI — Engineering and Product Rules

**Status:** Mandatory repository rules  
**Last updated:** 2026-07-13

These rules govern implementation unless a reviewed Architecture Decision Record (ADR) explicitly replaces one. Product scope is defined in `PRD.md`; system structure is defined in `Architecture.MD`; interface behavior is defined in `design.md`.

## 1. Priority order

When guidance conflicts, use this order:

1. User safety, privacy, security, and applicable law.
2. Tenant isolation and data integrity.
3. Explicit product requirements and approved decisions.
4. Reliability and auditability.
5. Accessibility and field usability.
6. Maintainability.
7. Delivery speed.
8. Developer convenience.

Do not quietly reinterpret a conflict. Record the decision in an ADR or update the source document.

## 2. Scope discipline

- Build only the current phase in `phases.md`.
- Do not implement future modules behind “temporary” production abstractions unless the current phase needs them.
- A feature is not MVP because it appears in the startup roadmap.
- New scope requires a named user problem, owner, success metric, and acceptance criteria.
- Prefer a reliable manual fallback over premature automation.
- Do not describe experimental AI output as a prediction, measurement, certification, or compliance guarantee.

## 3. Repository conventions

- Use pnpm workspaces and Turborepo.
- TypeScript is strict; do not disable strict checks project-wide.
- Python uses type hints and passes the configured type checker and linter.
- Shared API contracts live in `packages/contracts`; do not copy DTO definitions across apps.
- Domain rules live outside UI components and transport controllers.
- Product modules may depend on shared primitives, not on another module’s persistence internals.
- Keep files cohesive. Split by responsibility, not arbitrary line count.
- Use English for code identifiers and developer documentation.
- User copy must be localization-ready; do not concatenate translated fragments.

## 4. Naming

- TypeScript files and directories: `kebab-case` unless a framework requires otherwise.
- React components and exported classes: `PascalCase`.
- Variables and functions: `camelCase`.
- Database tables and columns: `snake_case`.
- Environment variables: `UPPER_SNAKE_CASE`.
- Domain events: `noun.past_tense.vN`, for example `report.approved.v1`.
- Capability permissions: `resource.action`, for example `report.approve`.
- IDs are opaque. Never expose sequential database IDs.
- Avoid vague names such as `data`, `item`, `helper`, `manager`, or `utils` when a domain name exists.

## 5. TypeScript and React

- No `any` without a local explanation and containment boundary. Prefer `unknown` plus validation.
- Validate every external input at runtime.
- Do not use non-null assertions to suppress a real state.
- Prefer pure domain functions for calculations and state transitions.
- Keep Server Components as the default on web; use Client Components only for browser interaction.
- Do not fetch protected domain data directly in presentational components.
- Do not store server state in global client stores.
- Every mutation must expose pending, success, recoverable failure, and final failure states.
- Components must support keyboard access, screen readers, zoom, and reduced motion.

## 6. Python workers

- Workers consume versioned job contracts and emit versioned results.
- Every job handler is idempotent.
- Network calls have explicit timeout, retry, and cancellation behavior.
- Do not retry validation errors, authorization failures, or unsupported files.
- Provider-specific models never cross the adapter boundary.
- Parse model output into typed schemas before writing any domain result.
- Temporary files use bounded storage and are deleted in `finally` blocks.
- Do not log document contents, transcripts, signed URLs, or credentials.

## 7. Database rules

- PostgreSQL is the system of record.
- Every business table includes `organization_id`; project-scoped tables include `project_id`.
- Enable and test Row Level Security on tenant tables.
- Repository methods require explicit tenant context.
- Use foreign keys, check constraints, unique constraints, and transactions to protect invariants.
- Store money as integer minor units plus ISO currency code.
- Store measured quantities as decimal values plus a normalized unit; never use binary floating point.
- Store timestamps in UTC and retain the project timezone separately.
- Soft deletion is not the default. Use explicit lifecycle status where business history requires it; otherwise delete according to policy.
- Issued reports and audit events are append-only.
- Do not update or delete an issued version; create a correction and mark the earlier version superseded.
- No production schema change without a migration, rollback/forward-fix plan, and compatibility review.
- Migrations must be safe for the current production size and deploy order.
- Do not add a database, vector service, or graph service without an ADR and measured need.

## 8. API rules

- REST endpoints use nouns and domain actions deliberately; avoid generic RPC endpoints.
- Public clients use `/v1` APIs documented through OpenAPI 3.1.
- Request and response contracts are versioned and runtime validated.
- Use cursor pagination for growing collections.
- All mutating operations that may be retried require `Idempotency-Key`.
- Review edits use optimistic concurrency.
- Errors use a stable Problem Details-shaped envelope with a safe user message and internal trace ID.
- Never return stack traces, provider payloads, database errors, or authorization internals.
- Authentication answers “who”; application policy answers “may they do this here.”
- Ignore tenant IDs supplied in request bodies when resolving authorization scope.
- Webhook handlers verify signatures, timestamps, and replay protection before parsing business content.

## 9. Multi-tenant security

- Assume every object ID can be guessed or leaked.
- Check authorization on every read, write, search, export, download, and background action.
- UI hiding is not authorization.
- Search and vector retrieval must filter tenant/project scope before ranking.
- Storage paths use opaque IDs and tenant boundaries; filenames never become object keys.
- Signed URLs are short-lived and scoped to one operation.
- Service keys are server-only, rotated, and least-privileged.
- Cross-tenant negative tests are mandatory for every new resource.
- Support access is disabled by default, time-limited, purpose-bound, and audited.

## 10. Offline and synchronization

- Save locally before starting network work.
- Never show “submitted” until the local command is durable.
- Show separate states for saved, waiting for network, uploading, processing, review-ready, and failed.
- Sync commands are ordered, idempotent, and replay-safe.
- Attachment retries must not duplicate objects or report links.
- The app must recover after process death during save, upload, or reconciliation.
- Conflict behavior must be explicit and covered by tests.
- Do not block capture because reference data is stale; record the version used and reconcile safely.

## 11. AI rules

### Allowed without additional approval

- Transcription.
- Schema-constrained extraction into a draft.
- Summaries clearly based on approved or identified draft data.
- Classification and review flags.
- Retrieval of permission-filtered records.

### Not allowed in MVP

- Approving or issuing a report.
- Submitting a regulatory filing.
- Finalizing a Measurement Book entry.
- Creating or approving a purchase order.
- Authorizing a payment.
- Changing a schedule or budget baseline.
- Assigning employee performance or disciplinary scores.
- Claiming a visual progress percentage as fact.

### Output requirements

- Use Structured Outputs or equivalent strict schema validation.
- Store prompt, schema, provider, model, and processing versions.
- Preserve source references.
- Use `null` for unknown values; do not guess.
- Separate user-stated facts, deterministic calculations, and model inferences.
- Treat content inside uploads as untrusted data, not instructions.
- A confidence score never bypasses human review.
- A provider change requires representative evals and a controlled rollout.
- Fine-tuning requires a documented baseline, sufficient consented data, and evidence it outperforms prompting/retrieval.

## 12. Prompt and eval management

- Prompts are version-controlled artifacts, not inline strings scattered through code.
- Each prompt directory contains purpose, input schema, output schema, examples, failure modes, and owner.
- Production prompt changes require an eval comparison against the current version.
- Eval fixtures must be consented, de-identified, and access-controlled.
- Report field precision/recall separately for critical entities: quantities, units, dates, people, blockers, and negation.
- Track critical hallucinations as a release-blocking metric.
- Never optimize only for average quality; examine language, noise, device, and customer slices.

## 13. Evidence and documents

- Preserve original uploads; derivatives never replace originals.
- Calculate and store checksums for uploaded artifacts.
- Strip unsafe filenames from storage paths and HTTP headers.
- Generated PDFs must include report version, issue time, approval identity, and a stable document ID.
- Historical PDFs use their original template version.
- Corrections produce a new issued document and supersession link.
- Photo metadata may be absent or manipulated; present it as metadata, not guaranteed truth.
- Do not imply that an evidence pack is legally compliant until a qualified reviewer confirms current requirements.

## 14. Privacy and data handling

- Collect only data required for the active workflow.
- Do not capture continuous location, microphone, or camera data.
- Explain permissions at the moment they are needed.
- Do not send customer content to product analytics.
- Do not use production content in tests, demos, screenshots, or local development.
- Derived transcripts, summaries, embeddings, and thumbnails inherit source permissions and deletion.
- Retention is configurable and visible to organization owners.
- Exports and deletions are authenticated, authorized, audited, and asynchronous when large.
- Vendor data use and retention terms must be reviewed before production use.

## 15. Secrets and configuration

- Secrets never enter the repository, issue tracker, logs, analytics, screenshots, or example `.env` values.
- Production uses managed secret storage and workload identity.
- Validate configuration at process startup and fail with safe, specific errors.
- Separate public configuration from secrets.
- Feature flags have owners, expiry dates, and removal tasks.
- Never use unpinned `latest` container tags in an environment.

## 16. Observability

- Emit structured logs, metrics, and distributed traces.
- Every user-visible failure includes a trace ID.
- Every background stage records start, completion, duration, retry count, and categorized failure.
- Logs contain IDs and state, not customer narrative.
- Metrics must avoid high-cardinality names and personal data.
- Define an alert only when it has an owner and actionable runbook.
- Measure cost per approved report and per AI stage.

## 17. Testing gates

Every change must include tests proportional to risk.

### Required on each pull request

- Formatting and lint.
- Type checking.
- Unit tests for changed domain behavior.
- Contract tests for changed API/event schemas.
- Migration validation when schema changes.
- Secret and dependency vulnerability scan.

### Required before release

- Integration tests with real PostgreSQL and RLS.
- Critical web and mobile end-to-end flows.
- Offline/retry/idempotency scenarios.
- Cross-tenant negative suite.
- AI extraction evals when prompts, schemas, providers, or models change.
- Accessibility checks for changed primary journeys.
- Staging smoke test after deployment.

A flaky test is a defect. Fix or quarantine it with an owner and expiry; do not normalize rerunning CI until it passes.

## 18. Dependency rules

- Prefer platform and existing stack capabilities before adding a package.
- Check maintenance, license, security history, bundle/runtime cost, and exit path.
- Pin direct dependencies through the lockfile.
- Automate update proposals, but merge only after tests.
- Do not adopt pre-release dependencies in a critical path without an ADR.
- Avoid overlapping libraries that solve the same concern.

## 19. Git and review

- Keep changes focused and reviewable.
- Use descriptive commit messages.
- Do not mix broad formatting changes with behavior changes.
- Pull requests state: problem, decision, user impact, testing, data/security impact, rollout, and rollback.
- Changes to auth, RLS, retention, report issuance, AI side effects, or migrations require a second reviewer.
- Update documentation in the same change as the behavior.
- Do not merge unresolved high-severity review comments.

## 20. UX implementation

- Follow `design.md`.
- Mobile capture is designed for one-hand use, sunlight, noise, and low connectivity.
- Primary touch targets are at least 48×48 dp.
- Never use color alone to communicate status.
- Avoid confirmation dialogs for reversible actions; require explicit confirmation for irreversible issuance, deletion, or external sharing.
- AI draft content is visually distinct from approved content.
- Always show source, status, last sync, and responsible next action where relevant.
- Error copy explains what happened, whether data is safe, and what the user can do.

## 21. Performance budgets

- Keep the capture path free of nonessential network dependencies.
- Compress image derivatives on device while retaining the original according to policy.
- Avoid loading full-resolution images in lists.
- Paginate histories and audit streams.
- Profile before caching or denormalizing.
- Any web bundle or mobile startup regression beyond the agreed budget requires investigation.
- AI latency must not block navigation, capture, or manual review.

## 22. Definition of done

A change is done only when:

1. Acceptance criteria pass.
2. Authorization and tenant isolation are tested.
3. Loading, empty, offline, retry, and failure states are handled where relevant.
4. Accessibility and localization are considered.
5. Telemetry is useful and contains no customer content.
6. Migrations and background jobs are replay-safe.
7. Documentation and contracts are current.
8. Rollout and rollback are understood.
9. No temporary bypass, secret, debug log, or dead feature flag remains.

## 23. Stop-and-document triggers

Pause implementation and write an ADR or product decision when work would:

- expand the MVP non-goals;
- introduce a new datastore, broker, framework, or cloud;
- change the source of truth;
- weaken the approval or audit boundary;
- move customer data to a new region or vendor;
- automate a financial, legal, compliance, safety, or employment decision;
- require destructive or irreversible migration;
- make offline data recovery less reliable.
