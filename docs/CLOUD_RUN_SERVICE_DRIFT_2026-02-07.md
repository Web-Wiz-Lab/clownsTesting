# Cloud Run Service Drift - Incident Notes (2026-02-07)

## Decision (for now)
- Keep existing production API service: `sling-scheduling`
- Keep production API URL: `https://sling-scheduling-89502226654.us-east1.run.app`
- Do not migrate service name today.

## Resolution Status (2026-02-09)
- Implemented in repo:
  - Deploy workflow canonicalized to `sling-scheduling`.
  - Pre-deploy existence guard added to prevent accidental new service creation.
  - Infra defaults/docs aligned to canonical service.

## What happened
- The deploy workflow targets `sling-scheduler-api`, not `sling-scheduling`.
- Retrying deploy jobs created and attempted to deploy to a second Cloud Run service.
- Result: production remained on the old working service, while CI/CD attempted changes on a different service.

## Evidence in repo
- Workflow target service name:
  - `.github/workflows/deploy-cloud-run.yml` (`SERVICE_NAME: sling-scheduler-api`)
- Infra script defaults:
  - `infra/cloudrun/deploy.sh` (`SERVICE_NAME` default is `sling-scheduler-api`)
  - `infra/cloudrun/set-runtime-config.sh` (`SERVICE_NAME` default is `sling-scheduler-api`)
- Current production state documentation:
  - `README.md` lists API URL as `https://sling-scheduling-89502226654.us-east1.run.app`

## Errors seen and meaning
- `storage.buckets.create denied`:
  - Deploy identity missing Storage permission needed by source-based Cloud Run build flow.
- `default service account missing roles/serviceusage.serviceUsageConsumer`:
  - Build/runtime default SA in project lacked required Service Usage role.
- `container failed to start and listen on PORT=8080`:
  - Most likely startup crash from missing required runtime env/secrets on the newly created service, not actual port-binding code issue.

## Why the app still worked
- Existing service `sling-scheduling` continued serving traffic.
- Failed deploys affected new/alternate service path, not necessarily active production traffic.
- UI can still work if `SCHEDULER_API_BASE_URL` points to the old working service URL.

## Deferred cleanup plan (when ready)
1. Pick one canonical service name and remove drift.
2. If keeping `sling-scheduling`, update all defaults and docs to that name:
   - `.github/workflows/deploy-cloud-run.yml`
   - `infra/cloudrun/deploy.sh`
   - `infra/cloudrun/set-runtime-config.sh`
   - docs references in `README.md` and `docs/GCP_SETUP.md`
3. Ensure runtime vars/secrets are set on the canonical service:
   - `SLING_API_TOKEN` secret binding
   - `SLING_CALENDAR_ID`
   - `SLING_MANAGER_USER_ID`
   - `CASPIO_BASE_URL`
   - `CASPIO_TOKEN_WEBHOOK_URL` or `CASPIO_ACCESS_TOKEN`
4. Verify GitHub secret `SCHEDULER_API_BASE_URL` matches canonical service URL.
5. After clean deploy success, delete/retire unused duplicate service.

## Quick validation commands for later
```bash
gcloud run services list --region us-east1
gcloud run services describe sling-scheduling --region us-east1 --format='value(status.url)'
gcloud run services describe sling-scheduler-api --region us-east1 --format='value(status.url)'
```

```bash
curl -i "https://sling-scheduling-89502226654.us-east1.run.app/healthz"
```
