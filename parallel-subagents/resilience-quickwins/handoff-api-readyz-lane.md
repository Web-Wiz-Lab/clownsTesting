# Handoff: `api-readyz-lane`

## Outcome Summary
- Status: `completed`
- Objective met:
  - `GET /readyz`: `yes`

## Why this was done
- Expose dependency-aware readiness so operators can distinguish process liveness from upstream degradation.

## Changes Made
- Files changed:
  - `services/api/src/app.js`
  - `services/api/test/http-routes.test.js`
- Key implementation notes:
  - Added readiness helpers to run Sling and Caspio checks with bounded result payloads.
  - Added `GET /readyz` route.
  - `/readyz` returns:
    - `200` + `summary: "ok"` when checks pass
    - `503` + `summary: "degraded"` when any check fails
  - Left `/healthz` unchanged for backward compatibility.
  - Added tests for both healthy and degraded `/readyz` scenarios.

## Validation
- Commands run:
  - `cd services/api && npm test`
- Results:
  - All tests passed (4/4 files), including new readiness tests.

## Risks / Tradeoffs
- Readiness checks use existing client calls; they validate dependency reachability but are not full synthetic transactions.
