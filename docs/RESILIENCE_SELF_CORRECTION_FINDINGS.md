# Resilience and Self-Correction Findings

Date: 2026-02-09  
Scope reviewed: current API/UI codebase, `docs/CHANGELOG.md`, and related resilience/ops docs.

## Current status snapshot

Status today: resilience quick wins from 2026-02-07 are in place, and service-name drift guardrails from 2026-02-09 are also in place.  
Core self-correction gaps (shared idempotency, rollback reconciliation worker, Caspio timeout/retry parity) are still open.

## Verified completed work

1. UI sends `Idempotency-Key` on write requests.
- Verified in `app/ui/main.js`.
- Sent for:
  - `POST /api/shifts/bulk`
  - `PUT /api/shifts/:occurrenceId`

2. API supports idempotent replay for bulk writes (process-local cache).
- Verified in `services/api/src/app.js` + `services/api/src/middleware/idempotency.js`.
- Behavior:
  - `POST /api/shifts/bulk` reads/writes idempotent responses by `Idempotency-Key`.
  - Storage is in-memory `Map` with 10-minute TTL.

3. Dependency-aware readiness endpoint exists with cache and manual refresh.
- Verified in `services/api/src/app.js`.
- `GET /readyz` checks Sling + Caspio.
- Returns `200` (`summary: "ok"`) or `503` (`summary: "degraded"`).
- Readiness cache uses `READINESS_CACHE_MS` (default `60000`).
- Cache bypass: `/readyz?refresh=1` or `/readyz?force=1`.

4. Atomic grouped update rollback is implemented and failure is surfaced.
- Verified in `services/api/src/routes/updates.js`.
- Failed atomic groups return rollback details and can report `rolledBack: false` when rollback fails.

5. Operational error escalation pipeline exists.
- Verified in `app/ui/main.js`, `services/api/src/app.js`, and `services/api/src/clients/error-reporter.js`.
- `POST /api/error-report` forwards structured error reports for Slack/Zapier escalation.

6. Cloud Run service-name drift guardrails were implemented on 2026-02-09.
- Verified in `.github/workflows/deploy-cloud-run.yml`, `infra/cloudrun/deploy.sh`, `infra/cloudrun/set-runtime-config.sh`, and `services/api/src/config/env.js`.
- Canonical service name is enforced as `sling-scheduling`.

7. Validation status remains green.
- Verified locally on 2026-02-09: `npm test` in `services/api` passed (`4/4`).

## Still open (high priority)

1. Shared idempotency storage is not implemented (P0).
- Current state: dedupe cache is process-local (`services/api/src/middleware/idempotency.js`).
- Risk: duplicate bulk writes are still possible across Cloud Run instance restarts/scale-out.
- Next step: move idempotency state to shared store (Redis or Firestore).

2. Rollback failure is detected but not self-healed asynchronously (P1).
- Current state: rollback is attempted inline only (`services/api/src/routes/updates.js`).
- No compensating queue/worker exists for later reconciliation.
- Risk: partial inconsistency can persist if rollback also fails.

3. Caspio client resilience is below Sling client resilience (P1).
- Current state: `services/api/src/clients/caspio.js` has token refresh retry for `401/403`, but no request timeout control and no transient retry budget/backoff parity with Sling.
- Risk: schedule load remains brittle during transient Caspio slowness/network issues.

## Medium-priority gaps (P2)

4. Write-route idempotency behavior is not fully aligned.
- UI sends `Idempotency-Key` for `PUT /api/shifts/:occurrenceId`, but API idempotent replay is currently implemented only for bulk `POST`.

5. UI/API deployment skew protection is still implicit.
- No explicit frontend/backend version handshake contract exists yet.

6. Recovery-focused observability is partial, not complete.
- Current telemetry includes structured API logs and error-report forwarding.
- Formal resilience KPIs/alerts (rollback recovery success rate, dependency SLO, retry exhaustion thresholds) are still not defined in-repo.

7. Documentation consistency needs one cleanup pass.
- `docs/CHANGELOG.md` (2026-02-09 entry) still says duplicate service `sling-scheduler-api` "can be deleted," while `docs/INCIDENT_REPORT.md` states it was already deleted.

## Updated recommended implementation order

Phase 1 (next quick win)
- Add Caspio timeout + transient retry/backoff policy with clear error codes.

Phase 2 (core self-correction)
- Replace in-memory idempotency cache with shared storage.
- Add compensating transaction queue/worker for rollback reconciliation.

Phase 3 (contract and operations hardening)
- Add explicit UI/API version handshake guard.
- Align idempotency semantics for single-shift `PUT` route (either enforce or stop sending key there).
- Define and wire resilience KPIs/alerts.
- Keep docs synchronized with deployed behavior.

## Next-session start checklist

1. Choose shared idempotency backend (`Redis` vs `Firestore`) and define key TTL/eviction semantics.
2. Implement Caspio timeout/retry parity first, then add tests for timeout and transient retry behavior.
3. Decide compensating-worker design (queue technology, retry policy, dead-letter handling) for rollback failures.
4. Run a quick docs consistency pass (`CHANGELOG`, incident report, API contract) after the next deploy.
