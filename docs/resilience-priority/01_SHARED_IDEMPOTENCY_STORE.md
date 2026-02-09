# Shared Idempotency Store

Last updated: 2026-02-09  
Priority: P0

## Implementation Decisions (Locked)

- Backend: Firestore (project `sling-scheduler`)
- Rollout scope: `POST /api/shifts/bulk` + `PUT /api/shifts/:occurrenceId` together
- `PENDING` TTL: 120 seconds
- `COMPLETED` TTL: 10 minutes
- Same key + different fingerprint: `409 IDEMPOTENCY_KEY_REUSED`
- Same key + active reservation: `409 IDEMPOTENCY_IN_PROGRESS`

## Why This Is Priority

Current dedupe is process-local in `services/api/src/middleware/idempotency.js` (in-memory `Map`, 10-minute TTL).  
On Cloud Run scale-out/restart, duplicate writes can bypass dedupe and apply twice.

## Current State (Verified)

- UI sends `Idempotency-Key` on:
  - `POST /api/shifts/bulk`
  - `PUT /api/shifts/:occurrenceId`
- API replay cache is only enforced for:
  - `POST /api/shifts/bulk` in `services/api/src/app.js`
- Storage is not shared across instances.

## Risks If Not Implemented

- Duplicate shift updates during retries, user double-clicks, or client/network retries.
- Cross-instance behavior becomes non-deterministic.
- More manual recovery and loss of trust in "safe retry" behavior.

## Target Outcome

Provide cross-instance idempotency for write routes with deterministic behavior:

- Same key + same request fingerprint -> replay prior response.
- Same key + different fingerprint -> reject with conflict.
- Concurrent same-key requests -> one processes, others replay or return "in progress."

## Functional Requirements

1. Shared backing store (Redis or Firestore) for idempotency records.
2. Key scope includes at least:
  - route/method identity
  - idempotency key
3. Request fingerprint enforcement to prevent unsafe key reuse.
4. TTL-based retention and automatic expiration.
5. Safe behavior under concurrent requests.

## Recommended Design

## Store Interface

Create a store abstraction (example methods):

- `reserve({ scopedKey, fingerprint, ttlSeconds })`
- `complete({ scopedKey, statusCode, payload, ttlSeconds })`
- `get({ scopedKey })`

States:

- `PENDING`: first request has reserved key but not completed.
- `COMPLETED`: response is persisted and replayable.

## Request Fingerprint

Fingerprint should include:

- HTTP method
- normalized route identity
- request body hash

If key exists with different fingerprint, return:

- `409` + code `IDEMPOTENCY_KEY_REUSED`

## Concurrent Request Handling

- First request reserves key atomically.
- Parallel request with same key:
  - if `COMPLETED`: replay stored response
  - if `PENDING`: return `409` (or `425`) `IDEMPOTENCY_IN_PROGRESS`

## Backend Options

1. Redis
- Pros: native TTL, atomic ops, low-latency locks/reservation.
- Cons: extra infra/service management.

2. Firestore
- Pros: simpler GCP-native ops if already used.
- Cons: more verbose transaction logic; higher latency than Redis for hot-path idempotency.

Recommended default: Redis if low-latency write throughput is expected.

## Implementation Plan

1. Add idempotency store adapter layer under `services/api/src/middleware/`.
2. Implement shared backend adapter (`redis` or `firestore`).
3. Replace in-memory `Map` use in `services/api/src/app.js`.
4. Add conflict and in-progress error envelopes.
5. Roll out route-by-route:
  - `POST /api/shifts/bulk` first
  - `PUT /api/shifts/:occurrenceId` after validation

## Config

Add env vars (exact names TBD):

- `IDEMPOTENCY_BACKEND=redis|firestore`
- backend connection settings
- `IDEMPOTENCY_TTL_SECONDS`
- optional `IDEMPOTENCY_PENDING_TTL_SECONDS`

## Test Plan

1. Unit tests for store adapter:
  - reserve success
  - reserve conflict (same key, different fingerprint)
  - complete/replay
2. Route tests:
  - replay on repeated key
  - conflict on key reuse with changed payload
  - in-progress behavior under simulated concurrency
3. Integration/smoke:
  - two-process simulation to prove cross-instance dedupe

## Acceptance Criteria

- No duplicate write application when retried across multiple API instances.
- Deterministic behavior for replay/conflict/in-progress cases.
- Existing tests remain green; new idempotency tests added for both bulk and single-write routes.

## Open Decisions

1. None for implementation scope in this phase.
