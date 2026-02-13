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

## 2026-02-13
- Scope:
  - Observability and resilience fixes for incident `bd35292f` (partial bulk update failure on 2026-02-12).
- Completed:
  - **Rec #1 — Sling error logging:** Added `console.error` with structured JSON (`sling_request_failed`) in `services/api/src/clients/sling.js` before throwing `ApiError` on non-2xx responses. Logs `requestId`, `method`, `url`, `status`, `durationMs`, and `payload`. Failed Sling requests are now visible in Cloud Run logs.
  - **Rec #2 — Report depth limit:** Increased `sanitizeForReport` depth from 4 to 7 in `app/ui/src/lib/errors.ts`. Sling error details (at depth 5) now survive truncation in Slack error reports.
  - **Rec #3 — Reduce concurrency:** Changed `CONCURRENCY` from 4 to 2 in `services/api/src/routes/updates.js`. Halves peak concurrent Sling API calls as a precaution until the rate limiting hypothesis is confirmed or ruled out.
- Deploy/Config:
  - No new env vars. Concurrency is a code constant. Redeploy API and UI to activate.
- Validation:
  - API tests: 28/28 passing. UI lint clean, build successful.
- Open/Next:
  - Monitor next multi-team bulk edit for Sling error logs to confirm or rule out rate limiting.
  - If rate limiting confirmed, consider stagger delays and/or env-configurable concurrency.

## 2026-02-13 — Append-Only Audit Log
- Scope:
  - New `audit_log` Firestore collection that permanently records every PUT/POST write request. Motivated by incident `bd35292f` — idempotency records were overwritten on retry and expired by TTL, making failed requests unrecoverable. Design doc: `docs/plans/2026-02-13-audit-log-design.md`.
- Completed:
  - **New file `services/api/src/middleware/audit.js`:** `createAuditStore(env)` factory with memory (test) and Firestore (production) backends. `deriveOutcome(statusCode, payload)` classifies results as `success`, `failure`, or `partial`. `withAuditLog()` wrapper exported for potential reuse. Firestore backend uses `ref.add()` for auto-generated document IDs — records are never overwritten.
  - **`fireAuditLog` helper in `services/api/src/app.js`:** Fire-and-forget audit write called after `sendJson` on both PUT `/api/shifts/:id` and POST `/api/shifts/bulk` routes. User response is never delayed by audit. On Firestore write failure, `console.error` logs the full audit record as structured JSON (every field preserved in Cloud Run logs).
  - **Audit record schema:** `requestId`, `idempotencyKey`, `method`, `path`, `body` (full request), `statusCode`, `payload` (full response), `durationMs`, `outcome`, `timestamp`, `auditWriteStatus`.
  - **`services/api/src/config/env.js`:** Added `auditCollection` env var.
  - **New test file `services/api/test/audit.test.js`:** 13 tests — `deriveOutcome` branch coverage (6), memory store behavior (2), `withAuditLog` wrapper (4 including failure fallback), integration test through full PUT route (1).
- Deploy/Config:
  - Optional new env var: `AUDIT_COLLECTION` (default: `audit_log`). Uses same Firestore database as idempotency (`sling-scheduler`). No TTL policy should be set on this collection — records are permanent.
  - Redeploy API to activate.
- Validation:
  - API tests: 41/41 passing (28 existing + 13 new audit tests). UI lint clean, build successful.
- Open/Next:
  - Do NOT set a Firestore TTL policy on `audit_log` — records must be permanent.
  - Future: build "Recent Activity" frontend feature using `audit_log` collection. The `outcome` field enables filtering; `timestamp` enables ordering.

## 2026-02-12 (in progress)
Main: `claude --resume 6b9bc99a-f281-417a-8492-85e8dd965aaf`
Reviewer: `claude --resume a342c71c-5844-4f00-a199-bcce888fb39f`
- Scope:
  - Code review fixes — addressing critical reliability and resilience issues identified in `docs/design/CODE_REVIEW_FIXES.md`.
- Completed:
  - **Fix #1 — Caspio client timeout:** Added `AbortController` + `setTimeout(env.requestTimeoutMs)` to both `fetchWebhookToken` and `request` in `services/api/src/clients/caspio.js`. Abort throws `CASPIO_TIMEOUT` (504). `clearTimeout` in `finally` blocks. The 401/403 retry path clears the old timer before recursing so each leg gets a fresh timeout. Matches the existing Sling client pattern in `sling.js:36-47`.
  - **Fix #2 — Unhandled async rejection:** Three-layer defense added. (1) `server.js:28-36`: `.catch()` on `handler(req, res)` promise — writes minimal 500 or calls `res.destroy()`. (2) `server.js:23-25`: `process.on('unhandledRejection')` safety net logs at `fatal` level without terminating. (3) `app.js:460-464`: `if (!res.headersSent)` guard around `sendError` in catch block with `else { res.destroy() }` — prevents `ERR_STREAM_DESTROYED` from escaping and explicitly cleans up connections at both inner and outer layers.
  - **Fix #3 — Sequential bulk updates parallelized:** Added `CONCURRENCY = 4` constant to `routes/updates.js`. Both `processFlatUpdates` and `processGroupedUpdates` now process batches of 4 in parallel via `Promise.allSettled`. `processAtomicGroup` and `rollbackAtomicSuccesses` remain sequential (required for atomic rollback). ~3.3x speedup for 10-team bulk edits (~8s -> ~2.4s).
  - **Fix #4 — searchSchedule no longer clears table:** Removed `teams: {}` and `unmatchedShifts: []` from `searchSchedule` initial setState in `use-schedule.ts`. Old data now stays visible during loading and is atomically replaced when the API responds. On error, old data remains visible with an error banner.
  - **Fix #5 — Bulk edit error preserves user edits:** Partial failure `setTimeout` in `updateAllTeams` (`use-schedule.ts`) now only clears the modal overlay. Removed `bulkEditMode: false` and `editedValues: {}` from the callback. User stays in bulk edit mode after partial failure and can retry or adjust values. Success path still correctly exits bulk edit mode.
  - **Fix #6 — Mutation guard for all edit paths:** Added `mutating: boolean` to `ScheduleState` in `use-schedule.ts`. Set `true`/`false` via `finally` blocks in `updateTeam`, `updateAllTeams`, and `updateUnmatched`. Wired through `SchedulePage.tsx` to disable: SearchBar (via `loading` prop), BulkControls "Edit All" button (new `disabled` prop), and all TeamRow Edit buttons (via `TeamsTable` `mutating` prop pass-through). Prevents double-reload races and concurrent edit conflicts.
- Deploy/Config:
  - No new env vars. Fix #1 uses existing `env.requestTimeoutMs` (default 12000ms). Fix #3's concurrency is a code constant (not env-configurable).
- Validation:
  - Code review passed for all items. All 28 existing API tests pass.
- Open/Next:
  - **Fix #3 defect resolved:** Non-atomic branch in `processGroupedUpdates` now wrapped in try/catch (lines 354-384), returning a failure result object on error. The `batch.map()` callback never rejects.
  - Remaining critical item #7 from `CODE_REVIEW_FIXES.md`.
  - Minor gap: `UnmatchedBanner` Edit buttons not disabled during mutations (low risk, consider follow-up).

## 2026-02-10
- Scope:
  - Stabilized post-redesign UI deployment/runtime behavior and fixed a bulk-edit regression.
- Completed:
  - Fixed Netlify build/deploy alignment for Vite UI:
    - `.github/workflows/deploy-ui-netlify.yml` now installs dependencies, builds `app/ui`, and deploys `app/ui/dist`.
    - Added workflow guard to fail fast if `SCHEDULER_API_BASE_URL` secret is missing.
    - `netlify.toml` now uses `base = "app/ui"` and `publish = "dist"` to avoid doubled publish paths.
  - Hardened frontend API base resolution in `app/ui/src/lib/api.ts`:
    - Priority: `VITE_API_BASE_URL` -> runtime `window.__SCHEDULER_API_BASE__` -> production Cloud Run fallback.
    - Prevents accidental Netlify-origin `/api/*` calls when API base env is absent.
  - Fixed Edit All Teams false "No changes to save" behavior:
    - Bulk row edits are now wired into shared bulk state (`SchedulePage` -> `TeamsTable` -> `TeamRow`).
    - Save now correctly detects changed teams and submits grouped bulk updates.
- Deploy/Config:
  - Netlify site settings must match Vite output:
    - Base directory: `app/ui`
    - Build command: `npm run build`
    - Publish directory: `dist`
  - No Cloud Run traffic change is required for Netlify 404 `/api/*` symptoms; that issue is UI API-base configuration.
- Validation:
  - `app/ui` checks passing: `npm run lint`, `npm run build`.
  - Build output generated successfully after fixes.
- Open/Next:
  - Confirm `SCHEDULER_API_BASE_URL` secret points to canonical Cloud Run URL.
  - Keep generated artifact `app/ui/tsconfig.tsbuildinfo` out of commits unless intentionally tracked.

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
