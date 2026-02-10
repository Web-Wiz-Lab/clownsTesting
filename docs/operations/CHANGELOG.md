# Changelog

This file is the quick handoff log for future sessions.
Use newest-first entries and keep each section brief and concrete.
Do not treat this file as runtime configuration truth; use `README.md` for current canonical env/service settings.

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

## 2026-02-09
- Scope:
  - Merged the UI redesign workstream and validated both backend and frontend checks.
  - Tightened workflow trigger rules to reduce unintended runs/deploys.
  - Continued doc hardening to keep runtime config truth centralized.
- Completed:
  - New React/Vite/Tailwind/shadcn UI is in `app/ui`; prior static UI retained in `app/ui-backup` for historical reference.
  - Updated `.github/workflows/api-ci.yml` to run only on `main` pushes.
  - Narrowed `.github/workflows/deploy-cloud-run.yml` path filters so docs-only changes under `infra/cloudrun` do not trigger API deploys.
  - Confirmed runtime env source-of-truth pattern remains `README.md` (ops docs reference it rather than duplicating full lists).
- Deploy/Config:
  - For local UI CORS testing, use a tagged Cloud Run revision at `0%` traffic and keep production at `100%` on a validated revision.
  - `CORS_ALLOWED_ORIGINS` must be a single comma-separated env value (not multiple duplicated env keys).
- Validation:
  - API tests passing: `npm test` in `services/api` (`5/5`).
  - UI checks passing: `npm run lint` and `npm run build` in `app/ui`.
- Open/Next:
  - Before final push/commit, confirm whether auxiliary files (`.claude/**`, `.mcp.json`, `temp-file.md`, screenshots, `app/ui/tsconfig.tsbuildinfo`) should remain in tracked history.
  - Rotate/revoke previously exposed webhook/token credentials in external systems and resolve GitHub secret-scanning alerts.

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
  - Keep `README.md` and `docs/design/API_CONTRACT.md` aligned with endpoint behavior changes.

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
  - Fixed Cloud Run API Dockerfile to install runtime dependencies and fail fast if Firestore import is unavailable.
  - Added explicit Firestore database targeting support via `IDEMPOTENCY_DATABASE_ID` for projects not using `(default)` database.
  - Updated operations docs to enforce single deployment authority and explicit traffic routing policy.
- Deploy/Config:
  - Canonical Cloud Run API service is `sling-scheduling`.
  - Duplicate `sling-scheduler-api` was deleted; incident report now tracks guardrails and prevention.
  - New idempotency env vars:
    - `IDEMPOTENCY_BACKEND=firestore`
    - `IDEMPOTENCY_COLLECTION=idempotency_records`
    - `IDEMPOTENCY_PENDING_TTL_SECONDS=120`
    - `IDEMPOTENCY_TTL_SECONDS=600`
    - `IDEMPOTENCY_DATABASE_ID=sling-scheduler` (required for this project)
- Validation:
  - `services/api` test suite passing (`npm test`, 5/5).
- Open/Next:
  - Add Caspio timeout/retry parity with Sling client.
  - Add compensating worker for rollback reconciliation failures.
