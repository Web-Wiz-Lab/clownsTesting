# Cloud Run Service Drift Incident Report (Ongoing)

Incident date:
- 2026-02-07

Current status:
- Monitoring complete and stable after remediation.
- Canonical service is `sling-scheduling`.
- Duplicate service `sling-scheduler-api` was deleted.
- Secondary deploy-path drift (GitHub Actions + Cloud Run/Cloud Build source deploy) was identified and documented.
- This file is an incident history document; current runtime config truth lives in `README.md`.

Canonical production references:
- API service name: `sling-scheduling`
- API URL: `https://sling-scheduling-89502226654.us-east1.run.app`
- GCP project: `sling-scheduler`
- Region: `us-east1`

## Summary
- CI/CD service naming drift caused GitHub Actions deploys to target `sling-scheduler-api` while production traffic remained on `sling-scheduling`.
- Retries and IAM fixes then attempted deployment against the wrong service name, creating a duplicate Cloud Run service path.

## Impact
- Production traffic was not directly broken because the UI still pointed at `sling-scheduling`.
- Deploy operations and troubleshooting became confusing because CI/CD and production referenced different services.

## Timeline
- 2026-02-07: Deploy attempts failed with IAM and startup errors while targeting `sling-scheduler-api`.
- 2026-02-07: Drift identified and decision made to keep `sling-scheduling` as canonical.
- 2026-02-09: Repository remediation completed to enforce canonical service targeting and prevent repeat drift.
- 2026-02-09: Runtime startup failure identified when enabling Firestore idempotency on non-default Firestore DB without explicit database ID.
- 2026-02-09: Dual deploy-path behavior observed creating two revisions per commit (GitHub deployer + compute service account source deploy).

## Incident Entry: 2026-02-09 (Firestore Idempotency + Dual Revision Routing)

### Symptoms
- UI returned generic unexpected-request errors on write actions (example request ID: `010091fd-42bb-41f0-84ed-4b27b9024a1b`).
- Firestore idempotency records were not visible even after successful write operations.
- Cloud Run revisions were duplicated per deploy:
  - one by `github-deployer@sling-scheduler.iam.gserviceaccount.com`
  - one by `89502226654-compute@developer.gserviceaccount.com`
- "Send all traffic to latest revision" selected the wrong revision in this dual-deployer state.

### Root Causes
- Firestore backend activation exposed missing runtime dependency in container startup:
  - `@google-cloud/firestore` was not installed in the image due to Dockerfile install gap.
- Firestore database in this project is non-default (`sling-scheduler`), but runtime did not yet specify explicit DB ID.
- Two active deploy paths (GitHub Actions + source-trigger-based deploy) produced competing revisions.

### Resolution
- Updated API Dockerfile to install runtime dependencies and fail fast on Firestore import at build time.
- Added explicit runtime support for non-default Firestore DB via:
  - `IDEMPOTENCY_DATABASE_ID`
- Set required runtime idempotency vars, including:
  - `IDEMPOTENCY_BACKEND=firestore`
  - `IDEMPOTENCY_DATABASE_ID=sling-scheduler`
- Routed traffic to validated GitHub-deployed revision only (manual explicit routing).

### Prevention / Guardrails
- Keep single deployment authority for API (`deploy-cloud-run.yml` GitHub Actions path).
- Disable duplicate source/trigger deploy paths for `sling-scheduling`.
- Avoid "send all traffic to latest revision" unless exactly one deploy pipeline is active.
- Keep Firestore idempotency config explicit in runtime docs and service env.

## Root Cause
- Hardcoded service name mismatch across deployment tooling.
- Workflow/scripts defaulted to `sling-scheduler-api` while production service was `sling-scheduling`.

## Contributing Factors
- Source-based Cloud Run deployment permission issues (`storage.buckets.create denied`).
- Missing service usage permission on default service account in project.
- New duplicate service lacked runtime config/secrets, leading to startup failure symptoms.

## What Was Changed (2026-02-09)
- `.github/workflows/deploy-cloud-run.yml`
  - Canonicalized `SERVICE_NAME` to `sling-scheduling`.
  - Added pre-deploy existence guard to fail fast if canonical service is missing.
- `infra/cloudrun/deploy.sh`
  - Default `SERVICE_NAME` changed to `sling-scheduling`.
- `infra/cloudrun/set-runtime-config.sh`
  - Default `SERVICE_NAME` changed to `sling-scheduling`.
- `services/api/src/config/env.js`
  - Added dynamic `serviceName` resolution: `SERVICE_NAME` -> `K_SERVICE` -> `sling-scheduling`.
- `services/api/src/app.js`
  - Replaced hardcoded service labels in `/healthz`, `/readyz`, and error-report payloads.
- `services/api/test/http-routes.test.js`
  - Updated assertions for canonical service labeling.
- Docs aligned:
  - `README.md`
  - `docs/operations/GCP_SETUP.md`
  - `docs/design/API_CONTRACT.md`
  - `infra/cloudrun/README.md`
  - `app/ui/config.js` example comment
- Firestore idempotency runtime hardening:
  - Added Dockerfile dependency install and build-time Firestore import check.
  - Added `IDEMPOTENCY_DATABASE_ID` support for non-default Firestore databases.
- Operational guidance hardening:
  - Added single deployment-authority rule (GitHub Actions only) and explicit traffic-routing policy.

## Verification Completed
- Local API tests passing: `npm test` in `services/api` (5/5).
- Repo drift controls are in place for deployment configuration.

## Decommission Status
- `sling-scheduler-api` decommission completed.
- Incident checklist remains documented for future migrations/audits.

## Ongoing Guardrails
- Keep `sling-scheduling` as the only canonical API service name unless a deliberate migration plan is approved.
- Keep the pre-deploy existence guard in GitHub Actions.
- Treat any change to Cloud Run service name as a documented migration event requiring coordinated config and doc updates.
