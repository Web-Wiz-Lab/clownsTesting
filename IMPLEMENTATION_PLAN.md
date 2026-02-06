# Sling Scheduler Rebuild Plan

## Objective
Rebuild the scheduling workflow from scratch into a robust, debuggable, and future-proof system with strict separation of concerns.

## Non-Negotiable Requirements
- Single occurrence updates only (never update full recurrence series).
- Bulk updates must support partial success.
- Canonical timezone: `America/New_York`.
- Existing files in `pastVersions/` remain untouched.
- New UI in new files only.
- CORS handled by backend on GCP Cloud Run.

## Target Architecture
- Frontend UI (new static app): date-driven scheduler interface.
- Backend API (Cloud Run): Sling adapter + validation + conflict handling + audit logging.
- Secret storage: GCP Secret Manager for Sling credentials/tokens.
- Observability: structured Cloud Logging with request IDs and per-shift outcomes.

## Separation of Concerns
- UI layer:
  - Renders schedule and edit controls.
  - Performs local input validation only.
  - Never calls Sling directly.
- API layer:
  - Owns Sling payload construction and normalization.
  - Enforces single-occurrence behavior.
  - Returns normalized error envelopes and partial-success results.
- Integration layer:
  - Caspio retrieval and mapping utilities.
  - Sling client module with retries/timeouts and deterministic error parsing.
- Platform layer:
  - Deployment, env config, secrets, IAM, CORS policy, health checks.

## Proposed New Structure
- `app/ui/index.html`
- `app/ui/styles.css`
- `app/ui/main.js`
- `services/api/src/server.(js|ts)`
- `services/api/src/routes/schedule.(js|ts)`
- `services/api/src/routes/updates.(js|ts)`
- `services/api/src/clients/sling.(js|ts)`
- `services/api/src/clients/caspio.(js|ts)`
- `services/api/src/domain/normalizers.(js|ts)`
- `services/api/src/domain/timezone.(js|ts)`
- `services/api/src/middleware/errors.(js|ts)`
- `services/api/src/middleware/request-id.(js|ts)`
- `services/api/src/config/env.(js|ts)`
- `services/api/test/*`
- `infra/cloudrun/` (service and deploy docs/scripts)

## API Contract (Initial)
- `GET /api/schedule?date=YYYY-MM-DD`
  - Returns matched teams + unmatched shifts + metadata.
- `PUT /api/shifts/:occurrenceId`
  - Updates one occurrence only.
- `POST /api/shifts/bulk`
  - Accepts array of occurrence updates.
  - Returns per-item results with `success|failed` and error details.
- `GET /healthz`
  - Liveness and config sanity checks.

## Error Model
- Standard response envelope:
  - `requestId`
  - `summary` (`ok`, `partial_success`, `failed`)
  - `results[]` (for bulk)
  - `error` (for single fail)
- Sling conflicts parsed into machine-readable fields:
  - `type`, `employeeId`, `shiftId`, `conflictWindow`, `raw`.

## Execution Phases
1. Foundation
- Initialize new frontend and backend folders.
- Define env schema and secrets contract.
- Add request ID and logging baseline.

2. Read Path
- Implement `GET /api/schedule`.
- Normalize data model for UI consumption.

3. Write Path
- Implement single update endpoint.
- Implement bulk partial-success endpoint.
- Add single-occurrence safeguards and timezone enforcement.

4. UI
- Build new UI file set consuming backend API only.
- Preserve date auto-load behavior (`?date=MM/DD/YYYY` -> ISO conversion).

5. Reliability
- Add retry/timeouts for transient failures.
- Add idempotency key support for bulk operations.
- Add integration-focused tests.

6. Deploy
- Cloud Run service in `us-east1` (`sling-scheduler` project).
- Configure CORS allowlist for Caspio/Netlify origins.
- Smoke tests and rollback notes.

## Debuggability Standards
- Every API response includes `requestId`.
- Every Sling call logs:
  - endpoint, method, occurrence id, duration, status.
- Bulk responses expose per-item root-cause details.
- No silent catch blocks.

## Acceptance Criteria
- Single recurring occurrence can be updated without affecting future dates.
- Bulk update returns partial success with clear per-item failures.
- Time values round-trip correctly in `America/New_York`.
- Frontend has zero direct Sling calls.
- System can be deployed and run from Cloud Run with documented steps.

## Open Decisions (to confirm during build)
- Runtime choice: Node.js + TypeScript or Node.js + JavaScript.
- Data persistence for operation history: none vs Firestore audit table.
- CI/CD now vs manual deploy first.
