# Changelog

This file is the quick handoff log for future sessions.
Use newest-first entries and keep each section brief and concrete.

## Entry Template

```md
## YYYY-MM-DD
- Scope:
  - Short summary of what was changed.
- Completed:
  - Key implementation 1
  - Key implementation 2
- Deploy/Config:
  - Any required env var, secret, or deploy step.
- Validation:
  - Tests/checks run and result.
- Open/Next:
  - Remaining task 1
  - Remaining task 2
```

## 2026-02-06
- Scope:
  - Stabilized scheduling updates, improved user error messaging, and added automatic Slack escalation via Zapier.
- Completed:
  - Added grouped atomic team update behavior with rollback semantics for team-level consistency.
  - Kept Edit All as partial-success across teams (one team failure does not block others).
  - Enforced recurring-shift safety rules (occurrence IDs required for recurring instances).
  - Added plain-language frontend error mapping and escalation guidance.
  - Added `POST /api/error-report` pipeline (UI -> API -> Zapier webhook -> Slack).
  - Switched webhook logic to trigger-only (no dependency on custom webhook response body).
  - Updated Caspio launcher target to `https://sling-scheduler.netlify.app?date=MM/DD/YYYY`.
- Deploy/Config:
  - Cloud Run env var required: `ERROR_REPORT_WEBHOOK_URL`.
  - API must include `/api/error-report` route in deployed revision.
- Validation:
  - `services/api` test suite passing (`npm test`, 4/4).
  - Live trigger to `/api/error-report` returned `summary: ok`, `data.triggered: true`, `webhookStatus: 200`.
- Open/Next:
  - After any future deploy, trigger one controlled error and confirm UI message + Slack notification still work.
  - Keep `README.md` and `docs/API_CONTRACT.md` aligned with endpoint behavior changes.

## 2026-02-07
- Scope:
  - Implemented resilience quick wins focused on write idempotency headers and dependency readiness visibility.
- Completed:
  - UI now sends `Idempotency-Key` for write calls (`POST /api/shifts/bulk`, `PUT /api/shifts/:occurrenceId`).
  - Added `GET /readyz` endpoint with Sling/Caspio dependency checks.
  - Added readiness response caching plus cache bypass query (`/readyz?refresh=1`).
  - Added route tests for `/readyz` healthy/degraded/cached/forced-refresh behavior.
- Deploy/Config:
  - Optional env var: `READINESS_CACHE_MS` (default `60000`).
- Validation:
  - `services/api` test suite passing (`npm test`, 4/4).
- Open/Next:
  - Replace process-local bulk idempotency cache with shared store (Redis or Firestore).
  - Add Caspio timeout/retry parity with Sling client.
  - Add compensating worker for rollback reconciliation failures.

## 2026-02-09
- Scope:
  - Fixed Cloud Run service-name drift and added deploy guardrails to prevent duplicate service creation.
  - Implemented shared idempotency controls for write routes using Firestore-backed store support.
- Completed:
  - Canonicalized Cloud Run deploy target to `sling-scheduling` in `.github/workflows/deploy-cloud-run.yml`.
  - Added pre-deploy check that fails workflow if canonical service is missing.
  - Updated infra script defaults to `sling-scheduling` in `infra/cloudrun/deploy.sh` and `infra/cloudrun/set-runtime-config.sh`.
  - Replaced hardcoded API service labels with runtime-derived value (`SERVICE_NAME` -> `K_SERVICE` -> fallback `sling-scheduling`).
  - Updated API route tests and docs for consistent service naming.
  - Converted `docs/CLOUD_RUN_SERVICE_DRIFT_2026-02-07.md` into an ongoing incident report with decommission checklist.
  - Replaced process-local idempotency cache with shared-store abstraction (`memory` or `firestore`) in `services/api/src/middleware/idempotency.js`.
  - Enforced idempotency reserve/replay semantics on both `POST /api/shifts/bulk` and `PUT /api/shifts/:occurrenceId`.
  - Added deterministic fingerprint conflict handling (`IDEMPOTENCY_KEY_REUSED`) and in-progress handling (`IDEMPOTENCY_IN_PROGRESS`).
  - Added idempotency-focused tests for replay/conflict/in-progress and route parity between POST/PUT.
- Deploy/Config:
  - Canonical Cloud Run API service is `sling-scheduling`.
  - Duplicate `sling-scheduler-api` was deleted; incident report now tracks guardrails and prevention.
  - New idempotency env vars:
    - `IDEMPOTENCY_BACKEND=firestore`
    - `IDEMPOTENCY_COLLECTION=idempotency_records`
    - `IDEMPOTENCY_PENDING_TTL_SECONDS=120`
    - `IDEMPOTENCY_TTL_SECONDS=600`
- Validation:
  - `services/api` test suite passing (`npm test`, 5/5).
- Open/Next:
  - Add Caspio timeout/retry parity with Sling client.
  - Add compensating worker for rollback reconciliation failures.
