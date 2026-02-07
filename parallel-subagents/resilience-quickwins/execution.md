# Execution Playbook: `resilience-quickwins`

## 1. Confirm task context

- Read `docs/RESILIENCE_SELF_CORRECTION_FINDINGS.md`.
- Focus on:
  - Missing UI `Idempotency-Key` on writes.
  - Missing dependency-aware readiness endpoint.

## 2. Implement UI idempotency key wiring

- Edit `app/ui/main.js`.
- Extend request utility so write methods can include `Idempotency-Key`.
- Generate key per write operation with stable format and UUID fallback.
- Ensure at minimum:
  - `POST /api/shifts/bulk` includes `Idempotency-Key`.
- Optional safe extension:
  - `PUT /api/shifts/:occurrenceId` includes `Idempotency-Key`.
- Keep existing headers (`Content-Type`, `X-Request-Id`) intact.
- Do not change user-visible behavior or UI layout.

## 3. Implement dependency-aware readiness endpoint

- Edit `services/api/src/app.js`.
- Add `GET /readyz` without altering existing `/healthz`.
- Readiness should evaluate dependencies needed for normal operation:
  - Sling availability check (lightweight, bounded).
  - Caspio availability/auth check (lightweight, bounded).
- Return machine-readable payload:
  - `summary: "ok"` when all checks pass.
  - `summary: "degraded"` when any check fails.
  - include per-check detail under `checks`.
- Use HTTP:
  - `200` for `ok`.
  - `503` for `degraded`.

## 4. Add/adjust tests

- Edit `services/api/test/http-routes.test.js`.
- Add test coverage for:
  - `GET /readyz` success case.
  - `GET /readyz` degraded case.
- Keep existing tests passing.

## 5. Validate and hand off

- Run `cd services/api && npm test`.
- Create handoff using `handoff-template.md` in this folder.
- Include:
  - changed files
  - test results
  - any residual risks
  - exact follow-up items intentionally deferred

## Non-negotiables

- No edits outside `agent.yaml` allowed paths.
- No scope creep into Redis/Firestore idempotency persistence.
- No UI redesign work in this lane.
