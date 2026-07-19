# BuildFlow v1 API

The mobile/offline contract is published as OpenAPI 3.1 at
`GET /api/v1/openapi.json`. Zod schemas in `packages/contracts/src/v1.ts` remain the runtime
validation source; `packages/contracts/src/openapi.ts` is the reviewed public description and
has a coverage test for every route.

All endpoints except login use an opaque bearer token. Tenant scope is resolved server-side;
clients cannot select an organization. Mutating sync calls are idempotent by device IDs and
may include `Idempotency-Key`. Errors use `application/problem+json`, include a safe trace ID,
and never echo request content. Authentication, public links, uploads and authenticated API
traffic use shared database-backed rate limits.

Compatibility policy: additive fields are allowed within v1. Removing/renaming fields,
changing state semantics, or tightening accepted input requires a new version or a documented
mobile rollout window.
