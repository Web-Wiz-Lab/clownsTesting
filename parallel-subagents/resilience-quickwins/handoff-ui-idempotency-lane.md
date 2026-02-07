# Handoff: `ui-idempotency-lane`

## Outcome Summary
- Status: `completed`
- Objective met:
  - `Idempotency-Key on writes`: `yes`

## Why this was done
- Add client-provided idempotency keys on write requests so retried submits are safer and backend dedupe can be used consistently.

## Changes Made
- Files changed:
  - `app/ui/main.js`
- Key implementation notes:
  - Added `buildIdempotencyKey()`.
  - Added `shouldSendIdempotencyKey(path, method)` to scope header use to write endpoints.
  - Updated `apiRequest(...)` to attach `Idempotency-Key` for:
    - `POST /api/shifts/bulk`
    - `PUT /api/shifts/:occurrenceId`
  - Preserved `Content-Type` and `X-Request-Id` behavior.

## Validation
- Commands run:
  - `cd services/api && npm test`
- Results:
  - API suite passed; no regressions introduced by shared request utility changes.

## Risks / Tradeoffs
- Client-side idempotency improves safety but does not fully solve cross-instance dedupe alone.
