# Agent Master History

This file archives the retired specialized agent packets and handoffs that were previously split across:
- `agents/01-architecture-agent.md`
- `agents/02-backend-agent.md`
- `agents/03-frontend-agent.md`
- `agents/04-qa-agent.md`
- `agents/05-devops-agent.md`
- `agents/handoffs/01-architecture-handoff.md`
- `agents/handoffs/02-backend-handoff.md`
- `agents/handoffs/03-frontend-handoff.md`
- `agents/handoffs/04-qa-handoff.md`
- `agents/handoffs/05-devops-handoff.md`

Archived on: 2026-02-09

## Architecture Agent (01)
Purpose:
- Define clean boundaries and maintainable module layout.

Responsibilities:
- Finalize folder structure and module ownership.
- Define API contract and error envelope.
- Define timezone and recurrence handling policy.
- Define logging schema and correlation ID strategy.

Deliverables:
- ADR-style architecture summary.
- Final route map and payload schemas.
- State transition rules for single and bulk updates.

Quality bar:
- No Sling-specific complexity leaking to UI.
- Write-path operations designed to be idempotent-safe.

## Backend Agent (02)
Purpose:
- Implement Cloud Run API as owner of Sling/Caspio integrations.

Responsibilities:
- Schedule read + update endpoints.
- Single-occurrence payload enforcement.
- Sling error normalization/classification.
- Retry/timeout policy for upstream calls.
- Structured logs with `requestId`.

Required modules:
- `routes/schedule`
- `routes/updates`
- `clients/sling`
- `clients/caspio`
- `domain/timezone`
- `domain/normalizers`
- `middleware/errors`
- `middleware/request-id`

Deliverables:
- Running API locally and in Cloud Run.
- Endpoint docs and examples.
- Tests for recurrence/conflict cases.

Quality bar:
- No direct token literals.
- Secrets via env/Secret Manager only.
- Clear per-item failure reasons in bulk responses.

## Frontend Agent (03)
Purpose:
- Build a backend-only UI client.

Responsibilities:
- Implement new UI files without touching legacy versions.
- Preserve Caspio query date auto-load.
- Implement single and bulk edit UX.
- Surface partial-success outcomes clearly.

Constraints:
- No direct Sling calls.
- No frontend tokens.
- Keep time editing aligned to `America/New_York`.

Deliverables:
- New UI bundle/API integration.
- Error and loading states.
- User diagnostics tied to `requestId`.

Quality bar:
- Clear separation of view state and API client logic.
- Defensive handling for malformed/missing API responses.

## QA Agent (04)
Purpose:
- Prevent regressions in recurrence, timezone, and bulk behavior.

Responsibilities:
- Build test matrix and execute critical-path validation.
- Verify recurring updates only change targeted occurrences.
- Verify bulk partial-success behavior and UI surfacing.
- Verify timezone conversion and New York DST edge behavior.

Minimum matrix:
- Single non-recurring update.
- Single recurring occurrence update.
- Bulk all success.
- Bulk partial success with conflict.
- Invalid payload/auth handling.
- Query-param date auto-load behavior.

Deliverables:
- Pass/fail report with evidence.
- Residual risk log.
- Production smoke checklist.

Quality bar:
- No release without recurring-occurrence and partial-success checks.

## DevOps Agent (05)
Purpose:
- Deploy and operate securely on Cloud Run.

Responsibilities:
- Set up Cloud Run service in `sling-scheduler` (`us-east1`).
- Integrate Secret Manager credentials.
- Configure CORS allowlist.
- Define deploy and rollback procedure.
- Add health checks and runtime config docs.

Deliverables:
- Deployment runbook.
- Environment variable contract.
- Cloud Run sizing/config summary.
- Post-deploy smoke results.

Quality bar:
- No plaintext credentials.
- Logs searchable by `requestId`.
- Deterministic redeployability.

## Handoff 01: Architecture
Built:
- Clean split across `app/ui`, `services/api`, `infra/cloudrun`.
- Normalized API envelope + `requestId`.
- Single-occurrence-only update behavior.

Validated:
- `docs/design/API_CONTRACT.md` reflects contract.
- `docs/design/ARCHITECTURE.md` reflects boundaries.

Open risks at handoff time:
- Final production CORS origin list confirmation.
- Persistence strategy decision for long-term audit history.

Changed files:
- `IMPLEMENTATION_PLAN.md`
- `docs/design/ARCHITECTURE.md`
- `docs/design/API_CONTRACT.md`

## Handoff 02: Backend
Status note:
- Historical pre-rollout snapshot.
- Production later added shared idempotency backend support (`memory` or `firestore`) for both write routes.

Built:
- Routes: `GET /healthz`, `GET /api/schedule`, `PUT /api/shifts/:occurrenceId`, `POST /api/shifts/bulk`.
- Request-handler factory in `src/app.js`.
- Sling timeout/retry client and Caspio token-refresh support.
- Single-occurrence enforcement and input validation.
- Bulk partial-success response model.
- Shared write-route idempotency via `Idempotency-Key`.
- Production CORS allowlist enforcement.

Validated:
- Source module syntax checks.
- Unit tests for timezone and recurrence-safe update path.

Open risks at handoff time:
- Live Sling/Caspio integration not executed in local environment.
- Firestore-backed idempotency required runtime env + IAM + database ID alignment.

Changed files:
- `services/api/src/app.js`
- `services/api/src/server.js`
- `services/api/src/routes/schedule.js`
- `services/api/src/routes/updates.js`
- `services/api/src/clients/sling.js`
- `services/api/src/clients/caspio.js`
- `services/api/src/domain/timezone.js`
- `services/api/src/domain/normalizers.js`
- `services/api/src/middleware/errors.js`
- `services/api/src/middleware/request-id.js`
- `services/api/src/middleware/idempotency.js`
- `services/api/src/utils/http.js`
- `services/api/src/config/env.js`

## Handoff 03: Frontend
Built:
- Standalone UI in `app/ui`.
- Date load/search view with team and unmatched tables.
- Single-row edit and bulk edit/save workflows.
- Error/success messaging with `requestId`.
- Caspio query date auto-load.
- Runtime API base config (`app/ui/config.js`).

Validated:
- UI imports and bindings via static inspection.
- No direct Sling/Caspio calls from frontend.

Open risks at handoff time:
- Needed E2E test against live API.
- Potential UX polish after coordinator feedback.

Changed files:
- `app/ui/index.html`
- `app/ui/styles.css`
- `app/ui/main.js`
- `app/ui/config.js`
- `app/ui/README.md`

## Handoff 04: QA
Built:
- Baseline timezone and single-occurrence route tests.
- `npm test` integration.
- Route-level handler tests for health, idempotency, and CORS rejection.

Validated:
- `node --test` passed on backend tests.
- Recurrence-safe update path validated for occurrence ID/date derivation behavior.

Open risks at handoff time:
- No live integration tests with Sling/Caspio credentials.
- Needed broader mocked HTTP route coverage.

Changed files:
- `services/api/test/timezone.test.js`
- `services/api/test/updates.test.js`
- `services/api/test/http-routes.test.js`

## Handoff 05: DevOps
Status note:
- Historical snapshot.
- Current operating rule: single API deployment authority (GitHub Actions) to avoid duplicate revisions per commit.

Built:
- Cloud Run deploy script and runbook.
- Service config recommendations.
- API Dockerfile and env template.
- GitHub Actions CI workflow.
- GitHub Actions Cloud Run deploy workflow (WIF).
- GitHub Actions Netlify deploy workflow.
- Netlify config (`netlify.toml`).
- Caspio launcher snippet.
- CI/CD prerequisites docs.
- One-time GCP WIF setup script.
- Cloud Run env/secret runtime config script.
- Detailed GCP and Netlify operator guides.

Validated:
- Deploy script executable.
- Config docs aligned with `sling-scheduler`/`us-east1`.
- Backend tests pass after CI addition.

Open risks at handoff time:
- Local env lacked `gcloud`, so live deploy not executed there.
- Secret creation and service variable wiring still required in project.

Changed files:
- `infra/cloudrun/deploy.sh`
- `infra/cloudrun/README.md`
- `infra/cloudrun/SERVICE_CONFIG.md`
- `services/api/Dockerfile`
- `services/api/.env.example`
- `.github/workflows/api-ci.yml`
- `.github/workflows/deploy-cloud-run.yml`
- `.github/workflows/deploy-ui-netlify.yml`
- `netlify.toml`
- `docs/operations/CI_CD.md`
- `docs/operations/GCP_SETUP.md`
- `docs/operations/NETLIFY_SETUP.md`
- `docs/design/HOSTING_STRATEGY.md`
- `integrations/caspio/manage-in-sling-launcher.html`
- `infra/cloudrun/setup-github-wif.sh`
- `infra/cloudrun/set-runtime-config.sh`
