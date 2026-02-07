# Resilience and Self-Correction Findings

Date: 2026-02-07  
Scope reviewed: API/UI implementation and docs after the 2026-02-07 resilience quick wins.

## Current status snapshot

## Completed on 2026-02-07 (Phase 1 partial)

1. UI now sends `Idempotency-Key` on write requests.
- Implemented in `app/ui/main.js`.
- Sent for:
  - `POST /api/shifts/bulk`
  - `PUT /api/shifts/:occurrenceId`
- Effect: improved retry safety signaling from client to API.

2. Dependency-aware readiness endpoint now exists.
- Added `GET /readyz` in `services/api/src/app.js`.
- Checks Sling and Caspio dependency availability.
- Returns:
  - `200` + `summary: "ok"` when healthy
  - `503` + `summary: "degraded"` when dependency checks fail

3. `/readyz` load risk was mitigated.
- Added server-side readiness cache (`READINESS_CACHE_MS`, default `60000`).
- Added cache bypass for manual checks: `/readyz?refresh=1` (or `force=1`).
- Effect: avoids live dependency calls on every probe while preserving on-demand fresh checks.

## Still open (high priority)

1. Idempotency storage is still process-local (P0).
- Current dedupe cache remains in-memory (`services/api/src/middleware/idempotency.js`).
- Risk: duplicate bulk updates are still possible across Cloud Run instance restarts/scale-out.
- Next step: move idempotency state to shared store (Redis or Firestore).

2. Rollback failure is detected but not self-healed (P1).
- Atomic grouped updates can report `rolledBack: false`.
- No compensating worker exists to reconcile partial rollback failures asynchronously.
- Risk: data inconsistency can persist after user exits.

3. Caspio client resilience is weaker than Sling client resilience (P1).
- Caspio client still lacks explicit timeout + transient retry parity with Sling behavior.
- Risk: schedule load remains brittle during intermittent Caspio slowness/failures.

## Medium-priority gaps (P2)

4. UI/API deployment skew protection is missing.
- No explicit frontend/backend version compatibility handshake.

5. Recovery-focused observability remains incomplete.
- No formal KPIs/alerts for rollback recovery outcomes, dependency SLO, retry exhaustion.

6. Documentation drift remains possible.
- Keep API/docs in sync whenever route/contract behavior changes.

## Updated recommended implementation order

Phase 1A (complete)
- UI `Idempotency-Key` sending for writes.
- `/readyz` readiness endpoint.
- `/readyz` cache + refresh controls.

Phase 1B (next quick win)
- Add explicit Caspio timeout/retry policy with structured error codes.

Phase 2 (core self-correction)
- Replace in-memory idempotency cache with shared storage.
- Add compensating transaction queue/worker for rollback reconciliation.

Phase 3 (operational maturity)
- Add UI/API version handshake guard.
- Add resilience metrics + alerting for self-healing outcomes.
- Keep contract docs aligned with deployed behavior.

## Next-session start checklist

1. Confirm `READINESS_CACHE_MS` value in deployed env is appropriate for expected probe frequency.
2. Decide shared idempotency backend (`Redis` vs `Firestore`) based on ops overhead and latency profile.
3. Implement Caspio timeout/retry parity before broader traffic growth.
