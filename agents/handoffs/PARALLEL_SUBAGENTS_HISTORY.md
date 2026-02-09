# Parallel Sub-Agents History

This file archives the retired `parallel-subagents/` packet system.

Archived on: 2026-02-09
Source folder removed: `parallel-subagents/`

## Archived Files
- `parallel-subagents/README.md`
- `parallel-subagents/resilience-quickwins/agent.yaml`
- `parallel-subagents/resilience-quickwins/execution.md`
- `parallel-subagents/resilience-quickwins/handoff-template.md`
- `parallel-subagents/resilience-quickwins/handoff-api-readyz-lane.md`
- `parallel-subagents/resilience-quickwins/handoff-ui-idempotency-lane.md`

## Parallel Sub-Agent Packets (Original README)

This folder defined task packets for specialized sub-agents that could run in parallel.

Packet structure:
1. `agent.yaml`
- Machine-readable scope, constraints, dependencies, deliverables.
2. `execution.md`
- Step-by-step workflow.
3. `handoff-template.md`
- Required output format.

Rules:
- Keep scope narrow and explicitly bounded to listed files.
- Include "why now" rationale.
- Define out-of-scope boundaries.
- Include concrete verification commands and pass/fail criteria.
- Require written handoff with risks, tests, and changed files.

## Archived Packet: `resilience-quickwins`

### Agent Spec (`agent.yaml`)

```yaml
schema_version: 1
agent_id: resilience-quickwins
title: "Resilience Quick Wins Sub-Agent"
owner: "parallel execution lane"

objective: >
  Implement the two lowest-risk hardening changes that reduce production failure impact
  without blocking UI redesign work:
  (1) UI-generated Idempotency-Key on write requests,
  (2) GET /readyz endpoint with dependency-aware readiness signals.

why_now:
  - "Current risk includes duplicate updates during retries/double-submits."
  - "Current health endpoint is liveness-only and does not expose dependency degradation."
  - "These are high-value, low-blast-radius changes that can run in parallel with UI refresh."

primary_references:
  - "docs/operations/RESILIENCE_SELF_CORRECTION_FINDINGS.md"
  - "app/ui/main.js"
  - "services/api/src/app.js"
  - "services/api/src/clients/sling.js"
  - "services/api/src/clients/caspio.js"
  - "services/api/test/http-routes.test.js"

in_scope:
  - "Add Idempotency-Key generation and header wiring in UI API request path."
  - "Ensure POST /api/shifts/bulk sends Idempotency-Key."
  - "Optionally send Idempotency-Key for PUT /api/shifts/:occurrenceId (safe and additive)."
  - "Add GET /readyz route returning readiness summary with dependency states."
  - "Add/adjust tests for new readyz behavior and idempotency header behavior where feasible."

out_of_scope:
  - "Replacing process-local idempotency cache with Redis/Firestore."
  - "Compensating transaction queue / rollback reconciler."
  - "Caspio retry/timeout redesign."
  - "UI visual redesign or CSS/layout changes."
  - "Infra rollout policy changes (load balancer/probe config updates)."

file_constraints:
  allowed_edit_paths:
    - "app/ui/main.js"
    - "services/api/src/app.js"
    - "services/api/test/http-routes.test.js"
  avoid_touching_paths:
    - "pastVersions/"
    - "app/ui/styles.css"
    - "app/ui/index.html"
    - "services/api/src/routes/"

implementation_requirements:
  - "Do not change existing API routes/response schemas except adding /readyz."
  - "Keep /healthz behavior unchanged for backward compatibility."
  - "Preserve X-Request-Id behavior."
  - "Treat readiness as non-destructive checks only."
  - "Return clear machine-readable status fields in /readyz response."

readyz_contract:
  method: "GET"
  path: "/readyz"
  response:
    required_fields:
      - "requestId"
      - "summary"
      - "service"
      - "checks"
    summary_values:
      - "ok"
      - "degraded"
  behavior:
    - "200 when all required dependency checks pass."
    - "503 when one or more required checks fail."
    - "Include per-dependency check detail (status + reason/code when failed)."

quality_bar:
  - "No regression in existing tests."
  - "New route and header behavior covered by tests."
  - "No secret/token literals."
  - "No unrelated refactors."

verification_commands:
  - "cd services/api && npm test"

deliverables:
  - "Code changes limited to allowed_edit_paths."
  - "Updated tests proving /readyz and idempotency header wiring."
  - "Completed handoff using handoff-template.md."
```

### Execution Playbook (`execution.md`)

Summary:
1. Read `docs/operations/RESILIENCE_SELF_CORRECTION_FINDINGS.md`.
2. Implement UI `Idempotency-Key` wiring in `app/ui/main.js`.
3. Implement `GET /readyz` in `services/api/src/app.js`.
4. Add/adjust tests in `services/api/test/http-routes.test.js`.
5. Run `cd services/api && npm test`.
6. Produce handoff using template.

Non-negotiables:
- No edits outside allowed paths.
- No scope creep into Redis/Firestore idempotency persistence.
- No UI redesign in this lane.

### Handoff Template (`handoff-template.md`)

Template captured:
- Outcome Summary (`completed | partial | blocked`)
- Why this was done
- Changes Made
- Validation
- Behavior Checks
- Risks / Tradeoffs
- Next Recommended Steps

### Handoff: `api-readyz-lane`

Outcome:
- Status: `completed`
- `GET /readyz`: `yes`

Changes:
- Files:
  - `services/api/src/app.js`
  - `services/api/test/http-routes.test.js`
- Added `GET /readyz` with dependency-aware checks for Sling/Caspio.
- Preserved `/healthz`.
- Added healthy/degraded route tests.

Validation:
- `cd services/api && npm test`
- Passed (at time of handoff): 4/4 test files.

Risk note:
- Readiness checks validate reachability, not full synthetic transactions.

### Handoff: `ui-idempotency-lane`

Outcome:
- Status: `completed`
- `Idempotency-Key on writes`: `yes`

Changes:
- File:
  - `app/ui/main.js`
- Added key generation + route/method-based key attachment for:
  - `POST /api/shifts/bulk`
  - `PUT /api/shifts/:occurrenceId`
- Preserved `Content-Type` and `X-Request-Id`.

Validation:
- `cd services/api && npm test`
- Passed at time of handoff.

Risk note:
- Client-side idempotency alone does not solve cross-instance dedupe.
