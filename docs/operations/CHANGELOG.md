# Changelog

This file is the quick handoff log for future sessions.
New entries goes at the bottom of the file and keep each section brief and concrete.
Do not treat this file as runtime configuration truth; use `README.md` for current canonical env/service settings.
Do not modify existing entries.
Multiple entries for the same day is okay.

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

## 2026-02-13 — Activity & Changelog Backend
- Scope:
  - New `GET /api/audit-log` endpoint and initial `system-changelog.json` static file. Design doc: `docs/plans/2026-02-13-activity-changelog-design.md`.
- Completed:
  - **`query()` method on audit store:** Added `query({ limit, cursor })` to both memory and Firestore backends in `services/api/src/middleware/audit.js`. Memory uses array index cursor; Firestore uses `orderBy('timestamp', 'desc')` with `startAfter(cursorDoc)`.
  - **New file `services/api/src/routes/audit-log.js`:** `extractScheduleDate(payload)` digs into two-level nested `payload.results[].results[].data.date`. `mapAuditEntry(raw)` transforms raw audit records into display-ready objects with `type`, `summary`, `scheduleDate`, and `groups`. `handleGetAuditLog()` route handler with limit clamping (1-50) and cursor pagination.
  - **`services/api/src/app.js`:** Registered `GET /api/audit-log` route between `/api/schedule` and `/api/shifts/`.
  - **New file `services/api/test/audit-log-route.test.js`:** 11 tests — `extractScheduleDate` (3), `mapAuditEntry` (6), integration through full HTTP route (2 including pagination).
  - **`services/api/test/audit.test.js`:** 3 new tests for `query()` method (newest-first, cursor pagination, empty store).
  - **New file `app/ui/public/system-changelog.json`:** Initial static changelog with entries for 2026-02-13, 2026-02-12, and 2026-02-10.
- Deploy/Config:
  - No new env vars. Redeploy API to activate the new endpoint. The `system-changelog.json` deploys automatically with the UI via Netlify.
- Validation:
  - API tests: 55/55 passing (41 existing + 14 new). UI lint clean, build successful.

## 2026-02-13 — Activity & Changelog Frontend
- Scope:
  - Frontend UI for both "Recent Activity" and "System Change Log" features, plus investigating indicator and developer preview page. Design doc: `docs/plans/2026-02-13-activity-changelog-design.md`. Implementation plan: `docs/plans/2026-02-13-activity-changelog-frontend-plan.md`.
- Completed:
  - **New types file `app/ui/src/types/activity.ts`:** `ActivityEntry`, `ActivityGroup`, `ActivityResponse`, and `ChangelogDay` interfaces matching the `GET /api/audit-log` API contract and `system-changelog.json` format.
  - **New hook `app/ui/src/hooks/use-activity.ts`:** Fetches from `GET /api/audit-log` via existing `apiRequest`. Tracks `loading`, `loadingMore`, `error`, `nextCursor`. `fetchMore()` appends paginated entries with cursor encoding.
  - **New hook `app/ui/src/hooks/use-changelog.ts`:** Fetches `system-changelog.json` via plain `fetch()`. Checks `clearInvestigating` field in JSON entries for developer-triggered flag clear. Exposes `dismissInvestigating()` and `checkInvestigating()` for UI state management.
  - **Modified `app/ui/src/lib/errors.ts`:** `reportErrorToOps()` now sets `localStorage` investigating flag (`changelog_investigating`) when the error report is triggered. New exports: `getInvestigatingFlag()` and `clearInvestigatingFlag()`. All localStorage operations wrapped in try/catch for private browsing safety.
  - **New component `app/ui/src/features/activity/ActivityDrawer.tsx`:** Sheet-based drawer for Recent Activity. Fetches on open. Displays entries newest-first with Eastern Time timestamps, outcome badges (success/failure/partial), expandable bulk group details via Collapsible. Pagination via "Load more" button. Empty, loading, and error states with retry.
  - **New component `app/ui/src/features/changelog/ChangelogDrawer.tsx`:** Sheet-based drawer for System Change Log. Loads static JSON on open. Displays entries grouped by date. Investigating banner with exact message: "Investigating an isolated incident that prevented a team from being updated. System remains operational." Banner shows on current open session then clears flag. Trigger button has pulsating red dot when investigating flag is active.
  - **New shadcn components installed:** `sheet.tsx`, `scroll-area.tsx`.
  - **`app/ui/src/features/schedule/SchedulePage.tsx`:** Both drawers integrated into top bar alongside branding. Investigating flag checked on mount via `useEffect` so pulsating dot is visible immediately. `handleDismissInvestigating` callback syncs local state when changelog opens.
  - **New preview page `app/ui/src/features/preview/PreviewPage.tsx`:** Dev-only component state inspector at `/preview`. Renders real production components with mock data. Control panel with 18 states across 3 categories: Recent Activity (7 states), System Change Log (4 states), Alerts & Modals (7 states). No PUT/POST requests — all mock data is static. Lazy-loaded behind `import.meta.env.DEV` guard — absent from production bundle.
  - **`app/ui/src/App.tsx`:** Routes to `PreviewPage` when `DEV && pathname === '/preview'`, otherwise renders `SchedulePage`.
- Deploy/Config:
  - No new env vars. Redeploy UI via Netlify to activate. `system-changelog.json` already created by backend task.
  - Preview page is dev-only — not included in production build. Access via `npm run dev` then `http://localhost:5173/preview`.
- Validation:
  - UI lint clean, build successful. Production bundle: 462.64 KB (no preview code included). API tests: 55/55 passing, no regressions.

// main agent: claude --resume ee1a6309-df6a-4f23-8e0c-982d948396ac
// implemented by: claude --resume 3d48e26c-45e3-46c9-a0f2-2b1949c57f33
// final reviewer: claude --resume 43f6ffed-ccf8-47b7-8597-002e23dce666

## 2026-02-13 — Activity & Changelog Drawer Hotfix
- Scope:
  - Fixed two post-deploy bugs preventing Activity and What's New drawers from functioning.
- Completed:
  - **Bug #1 — Drawers not opening (click does nothing):** `ActivityTriggerButton` and `ChangelogTriggerButton` were plain function components that did not forward `ref` or spread props. Radix's `<SheetTrigger asChild>` merges `onClick`, `ref`, and ARIA attributes onto its child via `Slot`, but both wrapper components silently discarded them. Converted both to `React.forwardRef` components that spread `...props` onto the inner `<Button>`.
  - **Bug #2 — Activity drawer crashes to blank screen:** Firestore stores `new Date()` as a Firestore `Timestamp` object. On read, `doc.data().timestamp` returned a `Timestamp`, not a JS `Date`. `mapAuditEntry` checked `instanceof Date` (false), fell through to `String()` producing `"[object Object]"`. Frontend's `new Date("[object Object]")` created `Invalid Date`, and `Intl.DateTimeFormat.format()` threw `RangeError`, crashing the React tree. Fixed at three layers:
    - Firestore query (`audit.js`): converts Timestamp to JS Date via `.toDate()` at read time.
    - API mapper (`audit-log.js`): defensive fallback chain handling Date, Firestore Timestamp, string, or missing values.
    - Frontend (`ActivityDrawer.tsx`): `formatTimestamp` now catches invalid dates gracefully instead of crashing.
- Deploy/Config:
  - No new env vars. Commit touches both `app/ui/**` and `services/api/**`, triggering both Netlify and Cloud Run workflows. After Cloud Run deploy, route 100% traffic to the new revision for the API timestamp fix to take effect.
- Validation:
  - API tests: 55/55 passing. UI lint clean, build successful.
- Open/Next:
  - Confirm both drawers open and display data correctly in production after deploy.


## 2026-02-20 — 3-Layer Bulk Update Resilience
- Scope:
  - Implemented 3-layer retry and fallback system for grouped bulk updates to recover from Sling API HTTP 417 concurrent modification locks. Motivated by incident `f9cf6543` (2/19/26): 6 of 13 teams failed during "Edit All Teams" because Sling locks all shifts sharing the same date/location/position during a PUT, rejecting concurrent writes with HTTP 417. Previous `CONCURRENCY=2` batching caused self-inflicted lock collisions, and 417 was not in the Sling client's retry list, so every rejection was immediate and final.
- Completed:
  - **Layer 1 — Sequential processing (`CONCURRENCY=1`):** Changed `CONCURRENCY` from `2` to `1` in `services/api/src/routes/updates.js:180`. Groups are now processed one-at-a-time, eliminating self-inflicted 417 locks between our own concurrent batches. The existing `processFlatUpdates` batching loop naturally becomes sequential.
  - **Layer 2 — Retry failed groups after initial pass:** Extracted `executeSingleGroup()` from the old `Promise.allSettled` callback into a standalone async function reusable by both initial pass and retry. Replaced the batching loop in `processGroupedUpdates` with a simple sequential `for` loop. After all groups finish, failed indices are collected and each is retried one-at-a-time in original order. Natural backoff: processing all groups sequentially means seconds have elapsed since the first failures, giving Sling's locks time to release.
  - **Layer 3 — Calendar-based fallback (event ID endpoint):** For groups still failing after Layer 2 retry, uses a different Sling endpoint pattern validated in Postman. Instead of `PUT /v1/shifts/{occurrenceId}` (colon-suffixed ID), fetches the raw calendar shift via `slingClient.getCalendarShifts(date)` (GET, no lock), matches by `user.id`, strips the `:date` suffix to get the base `eventId`, and PUTs to `PUT /v1/shifts/{eventId}`. New functions: `extractDateFromOccurrenceId()` parses `"4709706601:2026-02-21"` → `"2026-02-21"`. `extractEventId()` strips date suffix: `"4709706601:2026-02-21"` → `"4709706601"`. `processCalendarFallback()` orchestrates the full fallback flow with atomic semantics (both shifts in a team must succeed). `rollbackCalendarFallback()` reverses successful event PUTs if partial failure occurs within a group, mirroring the existing `rollbackAtomicSuccesses` pattern.
  - **Revised `processGroupedUpdates` flow:** Layer 1 (sequential initial pass) → collect failed indices → Layer 2 (retry each failed group) → collect still-failed indices → Layer 3 (calendar fallback for each) → build final summary. Successful retry/fallback results replace failed results at the same index. If all layers fail, original failure result is preserved. Frontend contract unchanged.
  - **Key reuse:** `buildOutboundShift()` works for Layer 3 because it spreads the calendar object, sets `id` to the eventId, and builds `dtstart`/`dtend` from the calendar shift's date/timezone + update's times. `slingClient.updateShift()` works with event IDs (no colon) since it just URL-encodes whatever ID is passed. `processAtomicGroup()` is reused as-is for Layer 2 retry via `executeSingleGroup()`.
  - **7 new tests in `services/api/test/updates.test.js`:** (1) Layer 2: retry succeeds on second attempt after 417. (2) Layer 2: retry also fails, original failure preserved. (3) Layer 2: retries in original failure order (3 groups, groups 1 & 3 fail, verify retry order). (4) Layer 3: calendar fallback succeeds when occurrence PUT fails but event PUT succeeds. (5) Layer 3: partial failure triggers rollback — first shift succeeds via event endpoint, second fails, verify rollback PUT with original calendar object. (6) Layer 3: returns null when calendar has no matching user — original failure preserved. (7) Integration: all 3 layers exercised end-to-end — group fails initial + retry, succeeds on calendar fallback.
- Deploy/Config:
  - No new env vars. No Sling client changes (`sling.js` unchanged). No frontend changes. Backend-only change in `services/api/src/routes/updates.js`. Redeploy API to activate.
- Validation:
  - API tests: 62/62 passing (55 existing + 7 new). No regressions. UI lint clean, build successful (462.90 KB production bundle).
- Open/Next:
  - Monitor next multi-team bulk edit for recurrence. With Layer 1 eliminating self-inflicted 417s, the only remaining trigger would be an external user editing the same schedule in Sling's web UI simultaneously.
  - ~~Consider adding HTTP 417 to the Sling client's `isTransientStatus()` retry list~~ — Done, see entry below.
  - Update incident `f9cf6543` status from "Root cause identified" to "Fix deployed" after confirming successful production deploy.

## 2026-02-20 — Sling Client: Retry HTTP 417
- Scope:
  - Added HTTP 417 (concurrent modification lock) to the Sling client's automatic retry list. Complements the 3-layer resilience system by catching 417s at the HTTP layer for all code paths, including single-shift updates.
- Completed:
  - Added `status === 417` to `isTransientStatus()` in `services/api/src/clients/sling.js:4`. The client now retries 417 with its existing exponential backoff (250ms, 500ms) before surfacing the error.
- Deploy/Config:
  - No new env vars. Redeploy API to activate.
- Validation:
  - API tests: 62/62 passing.

## 2026-02-20 — Bulk Update Progress Indicator (Preview)
- Scope:
  - New dynamic status ticker component for the "Edit All Teams" modal, replacing the static "Processing Request" spinner. Built in the dev preview page first for visual approval before production wiring.
- Completed:
  - **New component `app/ui/src/features/schedule/BulkUpdateProgress.tsx`:** Animated progress indicator with 5 scripted message phases (initialization, per-team processing, verification, recovery simulation, finalization). Variable-duration `setTimeout` chain with 3 timing buckets (short/medium/long) and anti-repetition logic. Weighted progress bar (team messages count 3x). Completed log showing last 4 messages with fade hierarchy. Hero spinner icon swaps to checkmark on completion. Phase labels, team counter, `aria-live` announcements, and `role="progressbar"` accessibility.
  - **Modified `app/ui/src/features/preview/PreviewPage.tsx`:** Added "Bulk Progress" control section with 2 preview states: `modal-bulk-progress` (13 teams, full simulation) and `modal-bulk-progress-small` (4 teams, quick demo). Both render inside a `DialogContent` wrapper with screen-reader-only `DialogTitle` and `DialogDescription`.
  - **Bug fix — duplicate log entries:** Moved `setCompletedMessages` and `setTeamsProcessed` out of the `setCurrentIndex` updater function into the `advance` function body using a ref. React Strict Mode double-invokes state updaters to check purity, which caused each completed message to appear twice.
- Deploy/Config:
  - No deploy needed. Preview-only — no production wiring yet. Access via `npm run dev` then `http://localhost:5173/preview` → "Bulk Progress" section.
- Validation:
  - UI lint clean, build successful. API tests unaffected (no backend changes).
- Open/Next:
  - Wire `BulkUpdateProgress` into `OperationModal` / `useSchedule` for production bulk edits, replacing the static spinner during `updateAllTeams`.

## 2026-02-20 — Bulk Update Progress Indicator (Production Wiring)
- Scope:
  - Wired the `BulkUpdateProgress` component into the real "Edit All Teams" flow so the animated status ticker runs alongside the actual API call. The animation syncs to the API response: speeding up remaining messages when the API finishes fast, or seamlessly looping through ambient messages if the API is slow. Replaced the static "Processing Request" spinner modal with an interactive progress modal that the user dismisses manually via a full-width button.
- Completed:
  - **`app/ui/src/features/schedule/BulkUpdateProgress.tsx` — Three-mode sync logic via new `apiDone` prop:**
    - Added `apiDone?: boolean` prop with three behavioral modes: (A) `undefined` = preview mode (existing behavior, animation runs on its own timer), (B) `false` = API still working (animation loops through ambient messages if scripted sequence exhausts, progress capped at 95%), (C) `true` = API responded (speed-up mode, remaining messages advance at 100-150ms each, then shows done state).
    - Added `LOOPING_MESSAGES` constant pool: "Confirming changes", "Verifying schedule integrity", "Cross-referencing calendar", "Syncing changes" — cycles at organic variable timing so the ticker never freezes during slow API responses.
    - Added `speedUpRef`, `loopingRef`, `loopIndexRef` refs to control mode transitions without re-renders. `getDuration()` returns 100-150ms when `speedUpRef.current` is true.
    - `useEffect` on `apiDone` sets `speedUpRef.current = true` and, if looping, kicks an immediate advance to exit the loop and reach done state.
    - Dismiss button changed from `size="sm"` to `w-full max-w-sm rounded-xl` — full-width with rounded corners.
  - **`app/ui/src/features/schedule/OperationModal.tsx` — Bulk rendering mode:**
    - Added `bulk` prop (`{ teamNames, failedTeams, apiDone, onDismiss }`). When present, renders `BulkUpdateProgress` instead of the static spinner/icon/message.
    - X (close) button hidden via `[&>button]:hidden` on `DialogContent` — user can only dismiss via the Done/Close button inside `BulkUpdateProgress`.
    - `onOpenChange` is a no-op in bulk mode (prevents ESC key dismissal during processing).
    - Screen-reader-only `DialogTitle` and `DialogDescription` for accessibility.
    - Non-bulk rendering path (single-team updates, unmatched shifts) unchanged.
  - **`app/ui/src/hooks/use-schedule.ts` — Extended modal state + dismiss action:**
    - Extended `modal` type with optional `teamNames?: string[]`, `failedTeams?: string[]`, `apiDone?: boolean`.
    - New `dismissModal` action: clears modal, exits bulk edit mode, resets edited values. Added to `ScheduleActions` interface and returned actions object.
    - Rewrote `updateAllTeams` modal lifecycle: initial setState includes `teamNames` (from changed teams), `failedTeams: []`, `apiDone: false`. Success path sets `apiDone: true` on existing modal (no type change, no auto-dismiss timer). Partial failure path sets `apiDone: true` and populates `failedTeams` from `result.results.filter(r => r.status === 'failed')`. Request error (catch) path sets `apiDone: true` with all team names as failed.
    - Removed all `setTimeout` auto-dismiss calls — user now controls modal dismissal via the BulkUpdateProgress button, which calls `dismissModal`.
  - **`app/ui/src/features/schedule/SchedulePage.tsx` — Prop wiring:**
    - `OperationModal` now receives `bulk` prop when `state.modal.teamNames` exists, passing through `teamNames`, `failedTeams`, `apiDone`, and `actions.dismissModal`. Single-team updates and unmatched shift updates (which don't set `teamNames` on modal) continue using the existing static modal behavior unchanged.
- Deploy/Config:
  - No new env vars. No backend changes. Frontend-only change across 4 files. Redeploy UI via Netlify to activate.
- Validation:
  - UI lint clean (`npm run lint`), build successful (`npm run build`, 469.93 KB production bundle).
  - Preview page unchanged — `BulkUpdateProgress` receives `apiDone={undefined}` (preview mode), all 3 preview states render correctly.
- Open/Next:
  - Manual production test after deploy: trigger "Edit All Teams" → confirm animated ticker runs, API sync works (speed-up on fast response, looping on slow), dismiss button is full-width, no X button visible during processing.
  - Monitor for edge case: if user navigates away during bulk update, modal state is orphaned. Consider cleanup on route change if this becomes an issue.
