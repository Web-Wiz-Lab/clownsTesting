# Cloud Run Service Drift Incident Report (Ongoing)

Incident date:
- 2026-02-07

Current status:
- Monitoring complete and stable after remediation.
- Canonical service is `sling-scheduling`.
- Duplicate service `sling-scheduler-api` was deleted.
- Secondary deploy-path drift (GitHub Actions + Cloud Run/Cloud Build source deploy) was identified and documented.
- This file is an incident history document; current runtime config truth lives in `README.md`.

Canonical production references:
- API service name: `sling-scheduling`
- API URL: `https://sling-scheduling-89502226654.us-east1.run.app`
- GCP project: `sling-scheduler`
- Region: `us-east1`

## Summary
- CI/CD service naming drift caused GitHub Actions deploys to target `sling-scheduler-api` while production traffic remained on `sling-scheduling`.
- Retries and IAM fixes then attempted deployment against the wrong service name, creating a duplicate Cloud Run service path.

## Impact
- Production traffic was not directly broken because the UI still pointed at `sling-scheduling`.
- Deploy operations and troubleshooting became confusing because CI/CD and production referenced different services.

## Timeline
- 2026-02-07: Deploy attempts failed with IAM and startup errors while targeting `sling-scheduler-api`.
- 2026-02-07: Drift identified and decision made to keep `sling-scheduling` as canonical.
- 2026-02-09: Repository remediation completed to enforce canonical service targeting and prevent repeat drift.
- 2026-02-09: Runtime startup failure identified when enabling Firestore idempotency on non-default Firestore DB without explicit database ID.
- 2026-02-09: Dual deploy-path behavior observed creating two revisions per commit (GitHub deployer + compute service account source deploy).

## Incident Entry: 2026-02-09 (Firestore Idempotency + Dual Revision Routing)

### Symptoms
- UI returned generic unexpected-request errors on write actions (example request ID: `010091fd-42bb-41f0-84ed-4b27b9024a1b`).
- Firestore idempotency records were not visible even after successful write operations.
- Cloud Run revisions were duplicated per deploy:
  - one by `github-deployer@sling-scheduler.iam.gserviceaccount.com`
  - one by `89502226654-compute@developer.gserviceaccount.com`
- "Send all traffic to latest revision" selected the wrong revision in this dual-deployer state.

### Root Causes
- Firestore backend activation exposed missing runtime dependency in container startup:
  - `@google-cloud/firestore` was not installed in the image due to Dockerfile install gap.
- Firestore database in this project is non-default (`sling-scheduler`), but runtime did not yet specify explicit DB ID.
- Two active deploy paths (GitHub Actions + source-trigger-based deploy) produced competing revisions.

### Resolution
- Updated API Dockerfile to install runtime dependencies and fail fast on Firestore import at build time.
- Added explicit runtime support for non-default Firestore DB via:
  - `IDEMPOTENCY_DATABASE_ID`
- Set required runtime idempotency vars, including:
  - `IDEMPOTENCY_BACKEND=firestore`
  - `IDEMPOTENCY_DATABASE_ID=sling-scheduler`
- Routed traffic to validated GitHub-deployed revision only (manual explicit routing).

### Prevention / Guardrails
- Keep single deployment authority for API (`deploy-cloud-run.yml` GitHub Actions path).
- Disable duplicate source/trigger deploy paths for `sling-scheduling`.
- Avoid "send all traffic to latest revision" unless exactly one deploy pipeline is active.
- Keep Firestore idempotency config explicit in runtime docs and service env.

## Root Cause
- Hardcoded service name mismatch across deployment tooling.
- Workflow/scripts defaulted to `sling-scheduler-api` while production service was `sling-scheduling`.

## Contributing Factors
- Source-based Cloud Run deployment permission issues (`storage.buckets.create denied`).
- Missing service usage permission on default service account in project.
- New duplicate service lacked runtime config/secrets, leading to startup failure symptoms.

## What Was Changed (2026-02-09)
- `.github/workflows/deploy-cloud-run.yml`
  - Canonicalized `SERVICE_NAME` to `sling-scheduling`.
  - Added pre-deploy existence guard to fail fast if canonical service is missing.
- `infra/cloudrun/deploy.sh`
  - Default `SERVICE_NAME` changed to `sling-scheduling`.
- `infra/cloudrun/set-runtime-config.sh`
  - Default `SERVICE_NAME` changed to `sling-scheduling`.
- `services/api/src/config/env.js`
  - Added dynamic `serviceName` resolution: `SERVICE_NAME` -> `K_SERVICE` -> `sling-scheduling`.
- `services/api/src/app.js`
  - Replaced hardcoded service labels in `/healthz`, `/readyz`, and error-report payloads.
- `services/api/test/http-routes.test.js`
  - Updated assertions for canonical service labeling.
- Docs aligned:
  - `README.md`
  - `docs/operations/GCP_SETUP.md`
  - `docs/design/API_CONTRACT.md`
  - `infra/cloudrun/README.md`
  - `app/ui/config.js` example comment
- Firestore idempotency runtime hardening:
  - Added Dockerfile dependency install and build-time Firestore import check.
  - Added `IDEMPOTENCY_DATABASE_ID` support for non-default Firestore databases.
- Operational guidance hardening:
  - Added single deployment-authority rule (GitHub Actions only) and explicit traffic-routing policy.

## Verification Completed
- Local API tests passing: `npm test` in `services/api` (5/5).
- Repo drift controls are in place for deployment configuration.

## Decommission Status
- `sling-scheduler-api` decommission completed.
- Incident checklist remains documented for future migrations/audits.

## Ongoing Guardrails
- Keep `sling-scheduling` as the only canonical API service name unless a deliberate migration plan is approved.
- Keep the pre-deploy existence guard in GitHub Actions.
- Treat any change to Cloud Run service name as a documented migration event requiring coordinated config and doc updates.

---
---

# Incident: Partial Failure on Bulk Team Update

**Incident ID:** `bd35292f-591a-4547-860b-dae72ff1795f`
**Reported:** 2026-02-12 9:35 PM ET (via Zapier/Slack)
**Source:** `sling-scheduler-ui`
**Status:** Investigating

---

## Timeline

| Time (ET) | Event |
|-----------|-------|
| 2026-02-12 ~9:35 PM | User opens schedule for 02/14/2026, edits all 4 teams, clicks Save |
| 2026-02-12 9:35:46 PM | Backend processes grouped bulk update (4 atomic groups, CONCURRENCY=4) |
| 2026-02-12 9:35:46 PM | Teams 2 & 4 succeed. Teams 1 & 3 fail with `SLING_REQUEST_FAILED` |
| 2026-02-12 9:35:46 PM | Both failed teams rolled back successfully |
| 2026-02-12 9:35:47 PM | Error report delivered to Slack via Zapier |

---

## Initial Findings

_Documented 2026-02-13 before Cloud Run logs were available._

### What happened

A user performed an "Edit All Teams" bulk save for 4 teams on the Feb 14 schedule. The backend sent a `POST /api/shifts/bulk` with 4 atomic groups, each containing 2 shift updates (main + assistant). All 4 groups were processed in parallel (`CONCURRENCY=4`).

- **Teams 2 & 4:** Both shifts updated successfully.
- **Teams 1 & 3:** Both failed with `SLING_REQUEST_FAILED`. Rolled back successfully (`rollback.status: completed`). No data loss.

The user was shown: _"Some teams were not updated (2/4 teams)."_ and the error was escalated to Slack.

### What we cannot see

The exact Sling HTTP status code and error response body are **not visible** in the error report. The `sanitizeForReport()` function in `app/ui/src/lib/errors.ts:30` truncates nested values at depth > 4. The critical Sling details (`status`, `method`, `url`, `durationMs`, `payload`) sit at depth 5 in the report structure and appear as `[Truncated]`.

Report depth trace:
```
depth 0: result { requestId, summary, counts, results }
depth 1:   results[0] { groupId, failure, rollback, ... }
depth 2:     failure { code, message, details, conflicts }
depth 3:       details { requestId, method, url, status, durationMs, payload }
depth 4:         each value here -> "[Truncated]"
```

The backend does log full Sling responses at `error` level in Cloud Run structured logs (`services/api/src/clients/sling.js:58-69`), but those logs were not yet retrieved at time of writing.

### Leading hypothesis: Sling API rate limiting (429)

**Supporting evidence:**

1. **`CONCURRENCY=4` was introduced the same day** (commit `0ebad2a`, Fix #3 in `CHANGELOG.md`). Before this change, groups were processed sequentially. This is the first time multiple teams hit Sling's API simultaneously.

2. **High request volume in a short window.** Each atomic group performs sequentially: 2 GETs (snapshot capture) then 2 PUTs (apply updates). With 4 groups in parallel, that produces up to 8 concurrent Sling API calls at peak and 16 total calls in rapid succession. With retries (2 per request), worst case is 48 calls in a short window.

3. **Interleaved failure pattern.** Teams 1 & 3 (indices 0, 2) failed while Teams 2 & 4 (indices 1, 3) succeeded. This is consistent with rate limiting where some requests slip through while others are throttled depending on arrival timing.

4. **Retry backoff is very short.** The Sling client retries transient errors (including 429) with linear backoff: `250ms * attempt` (250ms, 500ms). If Sling's rate limit window exceeds this, retries would also be rejected.

5. **429 produces the same error code.** The Sling client (`sling.js:52-69`) retries 429s via `isTransientStatus()`, but after exhausting retries it throws `SLING_REQUEST_FAILED` -- indistinguishable from a non-retryable failure in the error report.

6. **Empty `conflicts: []`.** Rules out Sling schedule conflicts (which would include conflict details). Rate limiting responses would not include conflict data.

### Alternative possibilities considered

| Cause | Assessment | Why less likely |
|-------|------------|-----------------|
| Schedule conflict (time-off, overlap) | Unlikely | `conflicts` array is empty. Sling 409 responses typically include conflict details that `normalizeSlingConflict` would extract. |
| Published schedule lock | Unlikely | All 4 teams were in the same bulk edit for the same date. If the schedule were locked, all teams would likely fail, not just 2. |
| Sling intermittent outage | Possible but unlikely | Would more likely affect all requests or random ones, not produce an interleaved success/fail pattern. |
| Shift data issue (bad occurrence IDs) | Unlikely | Input validation passes before Sling is called. Snapshot GETs in Phase 1 would catch missing/invalid shifts. |

### System behavior verified correct

- Atomic rollback worked as designed: both failed teams were fully reverted to their pre-update state.
- Error escalation pipeline (UI -> `/api/error-report` -> Zapier -> Slack) delivered successfully.
- User was kept in bulk edit mode after partial failure (Fix #5 from code review, same day).
- Idempotency key was generated for the request.

### Relevant code paths

| Component | File | Key lines |
|-----------|------|-----------|
| Frontend bulk save | `app/ui/src/hooks/use-schedule.ts` | 315-395 (`updateAllTeams`) |
| Error reporting | `app/ui/src/lib/errors.ts` | 344-381 (`reportErrorToOps`), 30-61 (`sanitizeForReport`) |
| Backend bulk routing | `services/api/src/routes/updates.js` | 337-414 (`processGroupedUpdates`) |
| Atomic group processing | `services/api/src/routes/updates.js` | 250-335 (`processAtomicGroup`) |
| Atomic rollback | `services/api/src/routes/updates.js` | 218-248 (`rollbackAtomicSuccesses`) |
| Sling HTTP client | `services/api/src/clients/sling.js` | 32-124 (`request` with retry logic) |

### Recommended fixes (pending root cause confirmation)

- **Observability:** Increase `sanitizeForReport` depth limit (currently 4) so Sling error details are preserved in Slack reports.
- **If rate limiting confirmed:** Reduce `CONCURRENCY` from 4 to 2, add stagger delays, and/or make concurrency env-configurable.

### Next steps

1. Retrieve Cloud Run logs for `requestId: bd35292f-591a-4547-860b-dae72ff1795f` to confirm the actual Sling HTTP status codes.
2. Expand this report with deeper findings once logs are available.

---

## Deeper Research

_Documented 2026-02-13 after reviewing Cloud Run structured logs._

### Cloud Run log findings

Queried Cloud Run logs for `requestId: bd35292f-591a-4547-860b-dae72ff1795f`. Found **12 entries**, all with `status: 200` and `msg: "sling_request_ok"`: 8 GETs and 4 PUTs.

**The 4 successful PUTs (Teams 2 & 4):**

| Shift ID | Timestamp (UTC) | Duration |
|----------|-----------------|----------|
| `4709706582:2026-02-14` | 02:35:45.587 | 248ms |
| `4709706576:2026-02-14` | 02:35:45.904 | 314ms |
| `4709706593:2026-02-14` | 02:35:46.398 | 224ms |
| `4709706575:2026-02-14` | 02:35:46.669 | 268ms |

These are 2 pairs of sequential PUTs from the 2 successful teams, all completing within a ~1.1s window.

**The 2 failed PUTs (Teams 1 & 3) are absent from logs entirely.** No error-level or warning-level entries exist for this requestId or in the surrounding timestamp window.

### Why the failed PUTs are invisible

The Sling client (`sling.js:72-82`) only calls `console.log` after confirming `response.ok`. When Sling returns a non-2xx status, the code throws an `ApiError` on line 58 without any logging. The error is caught by `processAtomicGroup`'s catch block, which builds a failure result object but also does not log. The partial-success response is returned as HTTP 200, so the outer error handler in `app.js` is never triggered either.

This means **two independent observability gaps** prevented diagnosis:

1. **Sling client does not log failed responses.** The `console.log` at `sling.js:72` only fires on success. Failed Sling requests (non-2xx) throw without any `console.error`, so their HTTP status codes and response bodies never reach Cloud Run logs.

2. **`sanitizeForReport` truncates error details.** The Slack error report -- the only other place that captures the Sling response -- truncates it at depth > 4 (see Initial Findings for depth trace).

### Impact on rate limiting hypothesis

The Cloud Run logs neither confirm nor rule out rate limiting. All 8 GETs and 4 PUTs that succeeded show normal 200 responses with 224-314ms durations (no elevated latency suggesting throttling). The 2 failed PUTs are simply absent. The initial hypothesis remains plausible but unverifiable with current instrumentation.

### Root cause determination

**Indeterminate.** The exact Sling HTTP status code and rejection reason for Teams 1 & 3 cannot be recovered from any available data source. Reproduction is not feasible as the shifts contain real scheduling data.

### Revised recommendations

Both observability gaps should be fixed before the next occurrence so any future failure is fully diagnosable:

1. **Add `console.error` for failed Sling responses** in `sling.js` before throwing the `ApiError`. Log the same structured JSON fields as the success path (`requestId`, `method`, `url`, `status`, `durationMs`) plus the response `payload`.
2. **Increase `sanitizeForReport` depth limit** from 4 to 6-7, or flatten critical Sling error fields to a higher level in the report payload so they survive truncation.
3. **Consider reducing `CONCURRENCY`** from 4 to 2 as a precaution until the rate limiting hypothesis can be confirmed or ruled out by the improved logging.

---

## Actual Cause

_Indeterminate._ The exact Sling HTTP status code for the two failed PUTs cannot be recovered. Rate limiting (429) remains the leading hypothesis based on circumstantial evidence (see Deeper Research), but cannot be confirmed or ruled out with the data available.

---

## Fix

**Applied 2026-02-13.** Four changes addressing all three revised recommendations plus durable audit trail:

1. **Added `console.error` for failed Sling responses** (`services/api/src/clients/sling.js`). Structured JSON log entry (`level: 'error'`, `msg: 'sling_request_failed'`) emitted before throwing `ApiError` inside the `if (!response.ok)` block. Includes `requestId`, `method`, `url`, `status`, `durationMs`, and `payload`. Mirrors the existing success-path logging at lines 72-82.

2. **Increased `sanitizeForReport` depth limit from 4 to 7** (`app/ui/src/lib/errors.ts`). Sling error details at depth 5 now survive truncation, plus 2 levels of headroom for response payload content.

3. **Reduced `CONCURRENCY` from 4 to 2** (`services/api/src/routes/updates.js`). Halves peak concurrent Sling API calls as a precaution until rate limiting can be confirmed or ruled out by the improved logging. Peak concurrent calls drops from 8 to 4; total rapid-fire calls for a 4-team bulk edit drops from 16 to 8 (sequential within each pair).

4. **Added append-only audit log** (`services/api/src/middleware/audit.js`). New `audit_log` Firestore collection records every PUT/POST write request with full request and response payloads, independent of idempotency store. Documents use auto-generated IDs (never overwritten). Fire-and-forget after response is sent; falls back to `console.error` on Firestore failure.

### Validation

- API tests: 41/41 passing (`npm test` in `services/api/`).
- UI lint: clean (`npm run lint` in `app/ui/`).
- UI build: successful (`npm run build` in `app/ui/`).

---
---

# Incident: Partial Failure on Bulk Team Update (Concurrent Modification Lock)

**Incident ID:** `f9cf6543-a27d-45b1-bce8-4d9d7ce96098`
**Reported:** 2026-02-20 03:00 UTC / 2026-02-19 10:00 PM ET (via Zapier/Slack)
**Source:** `sling-scheduler-ui`
**Status:** Root cause identified

---

## Timeline

| Time (ET) | Event |
|-----------|-------|
| 2026-02-19 ~10:00 PM | User opens schedule for 02/21/2026, edits all 13 teams, clicks Save |
| 2026-02-19 10:00:54 PM | Backend processes grouped bulk update (13 atomic groups, CONCURRENCY=2) |
| 2026-02-19 10:00:54 PM | 7 teams succeed, 6 teams fail with `SLING_REQUEST_FAILED` (HTTP 417) |
| 2026-02-19 10:00:54 PM | All 6 failed teams rolled back successfully |
| 2026-02-19 10:00:55 PM | Error report delivered to Slack via Zapier |

---

## Root Cause

**Sling API concurrent modification lock (HTTP 417).**

All 6 failed teams received the same error from the Sling API:

> "This action cannot be performed now as it affects events that are currently being modified by another user"

**HTTP status 417** is Sling's concurrency guard. When one PUT request begins modifying a shift, Sling locks all related events (same date, location, position). Any concurrent PUT affecting those events is immediately rejected with 417.

### Why this happened

With `CONCURRENCY=2`, teams were processed in batches of 2. Within each batch, both PUTs fire simultaneously via `Promise.allSettled()`. All 13 teams share:
- Same date: `2026-02-21`
- Same location: `151378`
- Same position: `151397`

Sling treats all shifts on the same date/location/position as related events under a single lock. The first PUT in each batch acquires the lock; the second is rejected.

### Evidence: batch-level failure pattern

| Batch | Team A (Result) | Team B (Result) |
|-------|-----------------|-----------------|
| 1 | Team 1 (**failed**, 63ms) | Team 2 (success) |
| 2 | Team 3 (**failed**, 69ms) | Team 4 (success) |
| 3 | Team 5 (**failed**, 60ms) | Team 6 (success) |
| 4 | Team 7 (success) | Team 8 (**failed**, 55ms) |
| 5 | Team 9 (**failed**, 59ms) | Team 11 (success) |
| 6 | Team 10 (**failed**, 99ms) | Team 12 (success) |
| 7 | Team 13 (success) | _(solo batch)_ |

In 6 of 7 batches, exactly 1 team failed and 1 succeeded. The solo batch (Team 13) succeeded. This is textbook concurrent write lock behavior.

Failed request durations (55-99ms) are much faster than typical successful Sling PUTs (224-314ms observed in 2/12 logs), confirming Sling rejected these at the lock-check stage without attempting the actual write.

### Why 417 was not retried

The Sling client (`sling.js:4`) only retries transient statuses: `408`, `429`, and `>= 500`. HTTP 417 is not in this set, so each failure was **immediate and final** with zero retry attempts.

### Relationship to 2/12 incident (`bd35292f`)

The 2/12 incident showed the same interleaved success/failure pattern (Teams 1 & 3 failed, Teams 2 & 4 succeeded at `CONCURRENCY=4`). That incident's root cause was listed as indeterminate because Sling error details were not logged at the time. This incident strongly suggests 2/12 was also caused by HTTP 417 concurrent modification locks, not the rate limiting (429) hypothesis.

### Contributing factor: possible concurrent external user

The Sling error message references "another user." It is unconfirmed whether a human user was simultaneously editing the 02/21 schedule in Sling's web UI. However, the batch-level failure pattern proves our own concurrent requests are sufficient to trigger the lock, independent of any external user.

---

## Impact

- **6 of 13 teams were not updated.** Failed teams: 1, 3, 5, 8, 9, 10.
- **No data loss.** All 6 failed teams were atomically rolled back (`rollback.status: completed`).
- **7 teams updated successfully.** Teams 2, 4, 6, 7, 11, 12, 13.
- User was shown: _"Some teams were not updated. Failed teams were safely undone, so their Sling values were preserved."_
- Error escalated to Slack via Zapier.

---

## System Behavior Verified Correct

- Atomic rollback worked as designed: all 6 failed teams reverted to pre-update state.
- Error escalation pipeline (UI -> `/api/error-report` -> Zapier -> Slack) delivered successfully.
- Sling error details (HTTP 417, response body) are fully visible in the error report payload, confirming the 2/13 observability fix (depth limit 4 -> 7) is working.
- User was kept in bulk edit mode after partial failure (can retry).

---

## Recommended Fixes

### 1. Add HTTP 417 to retry-with-backoff (high priority)

HTTP 417 is a transient condition (the lock clears once the competing write completes). The Sling client should retry 417 responses with a longer backoff than the current 250ms linear delay, since the competing write needs time to finish.

**File:** `services/api/src/clients/sling.js`
**Change:** Add `417` to `isTransientStatus()` or implement a separate retry path with ~1-2s backoff for 417 specifically.

### 2. Reduce CONCURRENCY to 1 for same-date/location operations (high priority)

Since Sling locks related events during modification, parallel PUTs for shifts on the same date and location will always conflict. Sequential processing (`CONCURRENCY=1`) would eliminate the lock contention entirely for same-schedule bulk edits.

**File:** `services/api/src/routes/updates.js`
**Consideration:** Could be made conditional -- use `CONCURRENCY=1` when all groups target the same date/location, and higher concurrency when groups target different dates.

### 3. Update 2/12 incident status (low priority)

Reclassify 2/12 incident `bd35292f` from "Indeterminate" to "Likely HTTP 417 concurrent modification lock" based on this incident's evidence.

---

## Relevant Code Paths

| Component | File | Key Detail |
|-----------|------|------------|
| Sling client retry logic | `services/api/src/clients/sling.js:4` | `isTransientStatus`: 408, 429, 500+ only; 417 not retried |
| Batch concurrency | `services/api/src/routes/updates.js:169` | `CONCURRENCY = 2` |
| Batch processing loop | `services/api/src/routes/updates.js:347-399` | `Promise.allSettled` per batch |
| Atomic group processing | `services/api/src/routes/updates.js:250-335` | Sequential PUTs within each group |
| Error report sanitization | `app/ui/src/lib/errors.ts:31` | Depth limit 7 (working correctly) |

---

## Next Steps

1. Decide on fix approach: retry 417 with backoff vs. reduce concurrency to 1 vs. both.
2. Implement and deploy the chosen fix.
3. Monitor next multi-team bulk edit for recurrence.
4. Confirm with operations team whether anyone was editing the 02/21 schedule in Sling's web UI around 10 PM ET on 2/19.
