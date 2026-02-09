# Sling Scheduler Rebuild Runbook

This repository contains the rebuilt Sling scheduling workflow with clear separation of concerns:
- `Caspio` is only the launcher entry point.
- `Netlify` hosts the UI.
- `Cloud Run` hosts the API and owns all Sling/Caspio integration logic.

This file is the single source of truth for setup, deployment, debugging, and future maintenance.

For AI session onboarding, use `SOURCE_OF_TRUTH.md` first (session stop log + full markdown map), then return here for operational detail.

## Current Production State

- UI URL: `https://sling-scheduler.netlify.app`
- API URL: `https://sling-scheduling-89502226654.us-east1.run.app`
- GCP project: `sling-scheduler`
- GCP region: `us-east1`
- Canonical timezone: `America/New_York`
- Required behavior:
  - Single occurrence updates only.
  - Team updates are atomic (2 staff in a team update together or rollback together).
  - Edit All allows partial success across teams (one failed team does not block others).
  - Idempotency records are persisted in Firestore and expire by TTL.

## Why This Architecture Exists

Old versions used browser-to-Sling calls through public proxies (`corsproxy.io`, then Make webhook middleware). That became unreliable and hard to debug.

The rebuilt architecture solves this by:
- Removing direct Sling calls from the browser.
- Centralizing business rules in backend routes.
- Using Cloud Run logs + request IDs for incident debugging.
- Keeping Caspio simple and future-proofing UI (React/shadcn migration ready).

## System Architecture

1. User clicks `Manage in Sling` button in Caspio.
2. Caspio opens Netlify UI with `?date=MM/DD/YYYY`.
3. UI converts date and calls Cloud Run API.
4. API reads Sling + Caspio data, normalizes payloads, enforces update rules.
5. API returns structured responses with `requestId`.

## Repository Layout

- `app/ui`
  - Static frontend (`index.html`, `main.js`, `styles.css`, `config.js`).
- `services/api`
  - Node.js Cloud Run API.
  - Sling/Caspio clients, routes, domain logic, middleware.
- `infra/cloudrun`
  - Deploy and environment setup scripts.
- `integrations/caspio`
  - Caspio launcher snippet.
- `.github/workflows`
  - CI and deploy workflows.
- `pastVersions`
  - Legacy versions kept for reference only. Do not modify.

## API Endpoints

- `GET /healthz`
- `GET /api/schedule?date=YYYY-MM-DD`
- `PUT /api/shifts/:occurrenceId`
- `POST /api/shifts/bulk`
- `POST /api/error-report`

Detailed contract: `docs/design/API_CONTRACT.md`

## Secrets and Configuration

### 1. GitHub Actions Secrets (Repo Settings)

Path: `GitHub -> Repo -> Settings -> Secrets and variables -> Actions`

Required:
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`
- `SCHEDULER_API_BASE_URL`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`

### 2. GCP Secret Manager

Required secret:
- `sling-api-token`

Bound in Cloud Run as env var:
- `SLING_API_TOKEN` -> `sling-api-token:latest`

### 3. Cloud Run Environment Variables

Required runtime vars:
- `SLING_CALENDAR_ID=7858`
- `CASPIO_TOKEN_WEBHOOK_URL=https://hook.us1.make.com/gcvwhpnw7fr8ptbg8d3dop5qyhmz6uqr`
- `REQUEST_TIMEOUT_MS=12000`
- `RETRY_ATTEMPTS=2`
- `APP_TIMEZONE=America/New_York`
- `SLING_BASE_URL=https://api.getsling.com`
- `SLING_MANAGER_USER_ID=21341367`
- `CASPIO_BASE_URL=https://c0ebl152.caspio.com/rest/v2`
- `CORS_ALLOWED_ORIGINS=https://sling-scheduler.netlify.app`
- `ERROR_REPORT_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/18732682/ueuyn1t/`
- `READINESS_CACHE_MS=60000`
- `IDEMPOTENCY_BACKEND=firestore`
- `IDEMPOTENCY_COLLECTION=idempotency_records`
- `IDEMPOTENCY_PENDING_TTL_SECONDS=120`
- `IDEMPOTENCY_TTL_SECONDS=600`
- `IDEMPOTENCY_DATABASE_ID=sling-scheduler` (required in this project because Firestore DB is not `(default)`)

## Deploy Paths

### UI Deploy (Netlify via GitHub Actions)

Workflow: `.github/workflows/deploy-ui-netlify.yml`

What it does:
1. Injects `SCHEDULER_API_BASE_URL` into `app/ui/config.js`.
2. Deploys `app/ui` to Netlify production.

### API Deploy (Cloud Run)

Canonical option:

1. GitHub Actions (required for normal operations)
- Workflow: `.github/workflows/deploy-cloud-run.yml`
- Uses Workload Identity Federation.

Emergency-only option:

2. Manual Cloud Console deploy (use only for urgent rollback/hotfix)
- If used, document the reason and immediately return to GitHub Actions as the single deploy path.

## Cloud Run Deployment Authority (Critical)

To prevent two revisions on every commit and accidental traffic routing to the wrong revision:
- Use exactly one API deploy path: GitHub Actions.
- In Cloud Run `sling-scheduling`, disable source-based auto deploy triggers.
- In Cloud Build, disable triggers that deploy this service from the same repo.
- Do not keep both GitHub Actions and Cloud Console source deploy active at the same time.

Expected result after each API commit:
- One new revision created by `github-deployer@sling-scheduler.iam.gserviceaccount.com`.
- No second revision created by `89502226654-compute@developer.gserviceaccount.com`.

## Revision Traffic Policy

- Do not use "Send all traffic to latest revision" if more than one deploy pipeline is active.
- Route traffic explicitly to the validated revision only.
- Keep production at `100%` on one known-good revision unless intentionally canarying.

## Caspio Integration

Use:
- `integrations/caspio/manage-in-sling-launcher.html`

Current launcher target:
- `https://sling-scheduler.netlify.app`

Expected query parameter:
- `?date=MM/DD/YYYY`

UI automatically converts this date to ISO and loads schedule.

## Local Development

### API

```bash
cd services/api
cp .env.example .env
# edit .env
set -a; source .env; set +a
npm start
```

### Tests

```bash
cd services/api
npm test
```

Current test suites:
- `test/timezone.test.js`
- `test/updates.test.js`
- `test/http-routes.test.js`
- `test/caspio-client.test.js`
- `test/idempotency.test.js`

## Operational Debugging Playbook

When user sees an error in UI, always capture:
- `requestId` from UI message.
- Endpoint that failed (`/api/schedule`, `/api/shifts/...`, `/api/shifts/bulk`).
- Date and user action.

### Check Cloud Run logs

Cloud Console:
- Cloud Run -> service -> Logs
- Filter by `requestId`.

Cloud Shell example:
```bash
gcloud run services logs read sling-scheduling \
  --region us-east1 \
  --project sling-scheduler \
  --limit 200
```

### Common Errors and Fixes

1. `Invalid Caspio token response`
- Cause: Make webhook token payload shape differs from expected root object.
- Fix implemented: parser now accepts multiple shapes (root, array, nested, JSON body string).
- Action: verify webhook still returns valid `access_token` and `expires_in`.

2. `404` from `https://sling-scheduler.netlify.app/api/...`
- Cause: UI API base missing, browser calls Netlify origin instead of Cloud Run.
- Fix: set `SCHEDULER_API_BASE_URL` and redeploy UI workflow.
- Safety fallback: `app/ui/config.js` includes current production API URL.

3. CORS blocked / origin rejected
- Cause: origin not in `CORS_ALLOWED_ORIGINS`.
- Fix: update Cloud Run env var with actual UI origin.

4. GitHub deploy failure: `artifactregistry.repositories.create denied`
- Cause: deploy identity missing Artifact Registry create permission.
- Workarounds:
  - Pre-create repository `cloud-run-source-deploy` in `us-east1`.
  - Grant proper Artifact Registry permissions.
  - Use manual Cloud Run web deploy.

5. Sling conflict errors in bulk updates
- Expected behavior:
  - One team update is atomic (rollback on failure within team).
  - Edit All can return partial success across teams.
- Action: inspect `results[]` in bulk response and confirm conflict windows.

6. Error reporting not firing to Slack/Zapier
- Symptom: UI shows error but no Slack alert.
- Causes:
  - `ERROR_REPORT_WEBHOOK_URL` missing in Cloud Run env.
  - API revision without `POST /api/error-report`.
- Action:
  - Confirm env var exists in Cloud Run service.
  - Check `POST /api/error-report` returns `summary: ok`.
  - Verify Zapier Zap is enabled and webhook URL is current.

7. `500` on write routes after enabling Firestore idempotency
- Symptom: UI shows unexpected error with `requestId`; Cloud Run requests log shows `500` on `POST /api/shifts/bulk` or `PUT /api/shifts/...`.
- Common cause in this project: Firestore database is `sling-scheduler`, but `IDEMPOTENCY_DATABASE_ID` is missing.
- Fix: set `IDEMPOTENCY_DATABASE_ID=sling-scheduler` on the serving revision.

8. Two API revisions appear for each commit
- Symptom: one revision deployed by `github-deployer@...` and another by `...compute@developer.gserviceaccount.com`.
- Cause: dual deploy pipelines (GitHub Actions + Cloud Run/Cloud Build trigger).
- Fix: disable the non-canonical deploy trigger path and keep GitHub Actions as single deployment authority.

## Recurrence Rules and Single-Occurrence Policy

Important design rule:
- Updates target occurrence IDs (`seriesId:YYYY-MM-DD`) only.
- Backend fetches current occurrence, applies edited time/status, and updates that occurrence.
- Bulk endpoint iterates items and returns per-item success/failure.

## Security Notes

- Never commit tokens in repo.
- Use Secret Manager for Sling token.
- Keep CORS allowlist strict.
- Keep runtime and deploy identities separate.

## Canonical Service Name

Canonical Cloud Run service:
- `sling-scheduling`

Deploy guardrail:
- `.github/workflows/deploy-cloud-run.yml` fails early if `sling-scheduling` is missing.
- This is intentional to prevent accidental creation of drifted services.

## Maintenance Checklist for Future Changes

Before making changes:
1. Confirm whether change is UI, API, or infra.
2. Keep `pastVersions/` unchanged.
3. Run API tests.
4. Deploy API first, then UI.
5. Validate with a date loaded from Caspio query param.
6. Record any new failure mode in this README + docs.

## Additional Documentation

- `docs/design/ARCHITECTURE.md`
- `docs/design/API_CONTRACT.md`
- `docs/operations/CHANGELOG.md`
- `docs/operations/CI_CD.md`
- `docs/operations/GCP_SETUP.md`
- `docs/operations/NETLIFY_SETUP.md`
- `docs/design/HOSTING_STRATEGY.md`

## Session Handoff (2026-02-06)

Completed:
1. Reworked update safety model to grouped atomic team updates with rollback via `POST /api/shifts/bulk`.
2. Enforced recurrence safety so recurring updates require occurrence IDs (`seriesId:YYYY-MM-DD`).
3. Improved frontend errors with plain-language messages and clear escalation guidance.
4. Added automatic UI error reporting flow:
   UI -> `POST /api/error-report` -> Zapier webhook (`ERROR_REPORT_WEBHOOK_URL`) -> Slack.
5. Switched webhook behavior to trigger-only (no dependency on custom webhook response body).
6. Finalized Caspio launcher target to `https://sling-scheduler.netlify.app?date=MM/DD/YYYY` (see `integrations/caspio/manage-in-sling-launcher.html`).

Where work stopped / next quick verification after any deploy:
1. Trigger one controlled UI/API error.
2. Confirm UI message is user-friendly and includes `Andrew was notified via Slack.`
3. Confirm Zapier receives payload from `/api/error-report`.

## Notes for AI Assistants (Codex/Claude)

When assisting on this project:
- Treat this README as canonical operations documentation.
- Preserve single deployment authority (GitHub Actions) unless user explicitly requests an emergency manual deploy.
- Preserve single-occurrence update behavior.
- Do not re-introduce browser direct calls to Sling.
- Include `requestId` in debugging steps and incident reports.
- Prefer incremental, test-backed changes and update this file after major workflow changes.
