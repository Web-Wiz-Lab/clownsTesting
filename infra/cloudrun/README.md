# Cloud Run Deployment Runbook

Target:
- Project ID: `sling-scheduler`
- Region: `us-east1`
- Service: `sling-scheduling`

## 1. Configure Project
```bash
gcloud config set project sling-scheduler
gcloud config set run/region us-east1
```

## 2. Create Secrets
```bash
echo -n 'SLING_TOKEN' | gcloud secrets create sling-api-token --data-file=-
echo -n 'CASPIO_STATIC_TOKEN_OR_EMPTY' | gcloud secrets create caspio-access-token --data-file=-
```

## 3. Deploy
```bash
./infra/cloudrun/deploy.sh
```

## 4. Set Runtime Environment
Use Cloud Run `Variables & Secrets`:
- `APP_TIMEZONE=America/New_York`
- `SLING_BASE_URL=https://api.getsling.com`
- `SLING_CALENDAR_ID=7858`
- `SLING_MANAGER_USER_ID=21341367`
- `CASPIO_BASE_URL=https://c0ebl152.caspio.com/rest/v2`
- `CASPIO_TOKEN_WEBHOOK_URL=<make-token-webhook>`
- `CORS_ALLOWED_ORIGINS=https://sling-scheduler.netlify.app` (add Caspio origin only if needed)
- `REQUEST_TIMEOUT_MS=12000`
- `RETRY_ATTEMPTS=2`
- `READINESS_CACHE_MS=60000`
- `IDEMPOTENCY_BACKEND=firestore`
- `IDEMPOTENCY_COLLECTION=idempotency_records`
- `IDEMPOTENCY_PENDING_TTL_SECONDS=120`
- `IDEMPOTENCY_TTL_SECONDS=600`

Attach secrets:
- `SLING_API_TOKEN` <- `sling-api-token`
- `CASPIO_ACCESS_TOKEN` <- `caspio-access-token` (optional if webhook is used)

## 5. Smoke Tests
```bash
curl -i "https://<service-url>/healthz"
curl -i "https://<service-url>/api/schedule?date=2026-02-07"
```

## 6. Rollback
Cloud Run keeps revision history:
1. Open Cloud Run service.
2. Select previous healthy revision.
3. Route 100% traffic to that revision.
