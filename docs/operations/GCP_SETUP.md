# GCP Setup (Detailed)

Project:
- `sling-scheduler`
- Project number: `89502226654`
- Region: `us-east1`

Repo:
- `Web-Wiz-Lab/clownsTesting`

## 1. Open Cloud Shell
Go to Google Cloud Console for project `sling-scheduler` and open Cloud Shell.

## 2. Run one-time GitHub WIF setup
```bash
cd /workspace
# clone repo if needed
# git clone https://github.com/Web-Wiz-Lab/clownsTesting.git
# cd clownsTesting

chmod +x infra/cloudrun/setup-github-wif.sh
./infra/cloudrun/setup-github-wif.sh
```

This prints two values for GitHub secrets:
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`

## 3. Create Sling token secret in Secret Manager
```bash
echo -n 'YOUR_SLING_TOKEN' | gcloud secrets create sling-api-token --data-file=-
```

If secret already exists:
```bash
echo -n 'YOUR_SLING_TOKEN' | gcloud secrets versions add sling-api-token --data-file=-
```

## 4. Deploy API from GitHub Actions
In GitHub -> Actions, run `Deploy API to Cloud Run`.

The workflow targets the canonical service `sling-scheduling` and fails early if that service is missing (anti-drift guard).

Deployment authority rule:
- Keep GitHub Actions as the only automatic deploy path for `sling-scheduling`.
- Disable Cloud Run source deploy triggers and Cloud Build triggers that also deploy this service.
- If both are enabled, each commit can create two revisions and "latest revision" traffic routing becomes unsafe.

Where to disable duplicate deploy paths:
- Cloud Run -> `sling-scheduling` -> `Source` / `Triggers`: disconnect source-based continuous deployment.
- Cloud Build -> Triggers: disable any trigger that deploys `sling-scheduling` from this repo.

## 5. Configure Cloud Run runtime vars/secrets
Run in Cloud Shell (replace webhook URL):
```bash
export CASPIO_TOKEN_WEBHOOK_URL='https://hook.us1.make.com/your-token-webhook'
chmod +x infra/cloudrun/set-runtime-config.sh
./infra/cloudrun/set-runtime-config.sh
```

This sets:
- `APP_TIMEZONE=America/New_York`
- `CORS_ALLOWED_ORIGINS=https://sling-scheduler.netlify.app`
- `READINESS_CACHE_MS=60000` (default if unset; increase for lower dependency probe load)
- `IDEMPOTENCY_BACKEND=firestore`
- `IDEMPOTENCY_COLLECTION=idempotency_records`
- `IDEMPOTENCY_PENDING_TTL_SECONDS=120`
- `IDEMPOTENCY_TTL_SECONDS=600`
- `IDEMPOTENCY_DATABASE_ID=sling-scheduler` (required for this project; Firestore DB is not `(default)`)
- Sling/Caspio envs
- Secret binding for `SLING_API_TOKEN`

Firestore notes:
- Ensure Firestore is enabled in project `sling-scheduler`.
- This project uses Firestore database ID `sling-scheduler` (non-default), so `IDEMPOTENCY_DATABASE_ID` must be set explicitly.
- Ensure the Cloud Run runtime service account has Firestore access (for example `roles/datastore.user`).
- Configure a Firestore TTL policy on `idempotency_records.expiresAt` so records expire automatically.

Traffic routing notes:
- Route traffic only to a validated ready revision.
- Avoid "send all traffic to latest revision" unless exactly one deploy pipeline is active.

## 6. Verify API
```bash
gcloud run services describe sling-scheduling --region us-east1 --format='value(status.url)'
# copy URL and test:
curl -i "https://<cloud-run-url>/healthz"
curl -i "https://<cloud-run-url>/readyz"
# optional fresh dependency check:
curl -i "https://<cloud-run-url>/readyz?refresh=1"
```

Revision sanity checks (Console):
- Revisions list should show one new revision per commit when deployment authority is configured correctly.
- Preferred deploy actor for normal releases: `github-deployer@sling-scheduler.iam.gserviceaccount.com`.
- If a second revision appears per commit (for example from `89502226654-compute@developer.gserviceaccount.com`), disable duplicate deploy triggers before using "latest revision" traffic options.

## 7. Add final GitHub secret for UI pipeline
Set:
- `SCHEDULER_API_BASE_URL=https://<cloud-run-url>`
