# CI/CD Setup

## Workflows Added
- `.github/workflows/api-ci.yml`
  - Runs backend tests on push/PR touching `services/api`.
- `.github/workflows/deploy-cloud-run.yml`
  - Deploys backend to Cloud Run on `main` updates (and manual dispatch).
- `.github/workflows/deploy-ui-netlify.yml`
  - Deploys `app/ui` to Netlify on `main` updates (and manual dispatch).

## Deployment Authority (Must Keep Single-Writer)
- Canonical API deploy path: `.github/workflows/deploy-cloud-run.yml`.
- Do not run parallel auto-deploy from Cloud Run source deploy / Cloud Build triggers for the same service.
- If dual pipelines are enabled, two revisions may be created per commit and traffic can shift to an unvalidated revision.

## Required GitHub Secrets
Set these in repo settings before deploy workflow can run:
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`
- `SCHEDULER_API_BASE_URL` (Cloud Run base URL used by UI runtime config)

For this repo, detailed setup is documented in:
- `docs/operations/GCP_SETUP.md`
- `docs/operations/NETLIFY_SETUP.md`

## GCP Service Account Permissions
Grant the deploy service account at least:
- `roles/run.admin`
- `roles/iam.serviceAccountUser`
- `roles/artifactregistry.writer`
- `roles/cloudbuild.builds.editor`

Grant the Cloud Run runtime service account at least:
- `roles/secretmanager.secretAccessor` (for `SLING_API_TOKEN`)
- `roles/datastore.user` (for Firestore idempotency backend)

## Post-Deploy Manual Step
Cloud Run environment variables and secrets still need to be configured in service settings:
- `SLING_API_TOKEN` (Secret Manager)
- `SLING_CALENDAR_ID`
- `SLING_MANAGER_USER_ID`
- `CASPIO_BASE_URL`
- `CASPIO_TOKEN_WEBHOOK_URL` or `CASPIO_ACCESS_TOKEN`
- `APP_TIMEZONE=America/New_York`
- `CORS_ALLOWED_ORIGINS=https://sling-scheduler.netlify.app` (plus Caspio origin only if Caspio calls API directly)
- `IDEMPOTENCY_BACKEND=firestore`
- `IDEMPOTENCY_COLLECTION=idempotency_records`
- `IDEMPOTENCY_PENDING_TTL_SECONDS=120`
- `IDEMPOTENCY_TTL_SECONDS=600`
- `IDEMPOTENCY_DATABASE_ID=sling-scheduler` (required in this project)
