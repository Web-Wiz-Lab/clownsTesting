# PUT Idempotency Mismatch

Last updated: 2026-02-09  
Priority: P1/P2 (depends on timeline for shared idempotency rollout)

## Problem

UI sends `Idempotency-Key` for `PUT /api/shifts/:occurrenceId` in `app/ui/main.js`, but API replay logic currently applies only to `POST /api/shifts/bulk` in `services/api/src/app.js`.

This creates semantic mismatch:

- client behavior implies idempotent safety on single-shift updates
- server currently does not enforce replay/dedupe on that route

## Risks If Not Addressed

- False confidence during retries on single-shift updates.
- Duplicate applies possible under retry/re-submit conditions.
- Support confusion when behavior differs between PUT and bulk POST.

## Target Outcome

Align client and server idempotency semantics for all write routes that send `Idempotency-Key`.

## Options

1. Full alignment (recommended)
- Keep UI sending key for PUT.
- Extend API idempotency middleware to `PUT /api/shifts/:occurrenceId`.
- Best long-term consistency.

2. Temporary alignment by narrowing UI behavior
- Stop sending key on PUT until backend support lands.
- Fast, but reduces retry safety signaling.

Recommended path: Option 1, implemented alongside shared idempotency store.

## Functional Requirements

1. For PUT with key:
  - same key + same fingerprint -> replay prior response
  - same key + different fingerprint -> conflict error
2. For PUT without key:
  - current behavior preserved
3. Response/error codes consistent with POST idempotency behavior.

## Implementation Plan

1. Introduce route-agnostic idempotency hook in request handler.
2. Apply it to:
  - `POST /api/shifts/bulk`
  - `PUT /api/shifts/:occurrenceId`
3. Add fingerprint generation shared across write routes.
4. Update API contract documentation for explicit PUT semantics.
5. Decide whether UI should include route/method in key generation inputs (optional).

## Test Plan

1. API route tests:
  - repeated PUT with same key/body replays response
  - repeated PUT with same key/different body returns conflict
  - PUT without key remains unchanged
2. UI behavior test/manual check:
  - ensure key still sent for PUT after backend support

## Acceptance Criteria

- PUT idempotency behavior is explicit, deterministic, and documented.
- No mismatch remains between UI signaling and API behavior.
- Tests cover replay and conflict paths for single-shift updates.

## Dependencies

- Strongly coupled to the shared idempotency backend decision.
- Error code taxonomy should be finalized before rollout.

## Open Decisions

1. If shared store is delayed, do we temporarily disable PUT key sending in UI?
2. Final conflict status code (`409` vs alternative) for key reuse mismatch.
