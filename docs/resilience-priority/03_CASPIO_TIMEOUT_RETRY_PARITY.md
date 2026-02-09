# Caspio Timeout/Retry Parity

Last updated: 2026-02-09  
Priority: P1 (quick win)

## Why This Is Priority

`services/api/src/clients/sling.js` has timeout and transient retry behavior.  
`services/api/src/clients/caspio.js` currently has token-refresh retry for `401/403`, but no explicit timeout control and no transient retry budget/backoff parity.

## Current State (Verified)

- Caspio client:
  - token refresh retry for `401/403` when webhook is configured
  - no `AbortController` timeout for outbound request
  - no retry loop for transient statuses (`408`, `429`, `5xx`) or network errors
- Readiness endpoint and schedule flow depend on Caspio calls.

## Risks If Not Implemented

- Intermittent Caspio slowness can hang until platform/network timeout.
- Transient failures fail fast without retry, causing avoidable user-facing failures.
- Inconsistent resilience behavior between dependencies (Sling vs Caspio).

## Target Outcome

Give Caspio client retry and timeout behavior comparable to Sling while preserving token refresh logic.

## Functional Requirements

1. Request timeout using `AbortController`.
2. Retry budget for transient failures:
  - statuses: `408`, `429`, `5xx`
  - network failures
  - timeout failures
3. Preserve special `401/403` token-refresh retry behavior.
4. Structured Caspio error taxonomy.

## Recommended Error Codes

- `CASPIO_TIMEOUT`
- `CASPIO_NETWORK_ERROR`
- `CASPIO_REQUEST_FAILED` (non-transient or final non-OK response)
- `CASPIO_RETRY_EXHAUSTED`
- existing auth codes remain:
  - `CASPIO_AUTH_FAILED`
  - `CASPIO_AUTH_BAD_RESPONSE`
  - `CASPIO_AUTH_CONFIG_ERROR`

## Retry Strategy

- Attempts: configurable (default aligned with Sling `RETRY_ATTEMPTS` or dedicated Caspio var).
- Backoff: linear/exponential with jitter.
- Token refresh:
  - still only on `401/403`
  - should not bypass retry accounting unexpectedly.

## Config

Option A: reuse current global settings:

- `REQUEST_TIMEOUT_MS`
- `RETRY_ATTEMPTS`

Option B: add Caspio-specific vars:

- `CASPIO_TIMEOUT_MS`
- `CASPIO_RETRY_ATTEMPTS`

Recommended: start with Option A for speed, add Option B only if tuning divergence is needed.

## Implementation Plan

1. Add timeout and retry loop to Caspio request path.
2. Add transient-status classifier mirroring Sling semantics.
3. Integrate token-refresh retry cleanly with retry loop.
4. Standardize error codes/messages/details.
5. Add structured logs for retries and final failures.

## Test Plan

1. Unit tests in `services/api/test/caspio-client.test.js`:
  - timeout -> retry -> success
  - timeout/network retry exhaustion
  - transient `5xx` retry then success
  - non-transient `4xx` no retry
  - `401/403` token refresh path still works
2. Route tests (if needed):
  - `/readyz` degraded payload includes expected Caspio code

## Acceptance Criteria

- Caspio calls no longer wait indefinitely; timeout is enforced.
- Transient failures are retried before final failure.
- Error codes distinguish timeout/network/retry-exhausted cases.
- Existing tests remain green and new Caspio resilience tests are added.

## Open Decisions

1. Shared vs Caspio-specific timeout/retry env vars.
2. Exact backoff profile and max retry count.
