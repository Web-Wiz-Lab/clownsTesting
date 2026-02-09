# Cloud Run Service Drift Incident Report (Ongoing)

Incident date:
- 2026-02-07

Current status:
- Monitoring complete and stable after remediation.
- Canonical service is `sling-scheduling`.
- Duplicate service `sling-scheduler-api` was deleted.

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
  - `docs/GCP_SETUP.md`
  - `docs/API_CONTRACT.md`
  - `infra/cloudrun/README.md`
  - `app/ui/config.js` example comment

## Verification Completed
- Local API tests passing: `npm test` in `services/api` (4/4).
- Repo drift controls are in place for deployment configuration.

## Duplicate Service Decommission Plan
- Goal: remove `sling-scheduler-api` after confirming no active dependency remains.

## Ongoing Guardrails
- Keep `sling-scheduling` as the only canonical API service name unless a deliberate migration plan is approved.
- Keep the pre-deploy existence guard in GitHub Actions.
- Treat any change to Cloud Run service name as a documented migration event requiring coordinated config and doc updates.
