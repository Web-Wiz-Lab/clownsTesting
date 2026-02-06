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

The first run creates `sling-scheduler-api` service.

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
- Sling/Caspio envs
- Secret binding for `SLING_API_TOKEN`

## 6. Verify API
```bash
gcloud run services describe sling-scheduler-api --region us-east1 --format='value(status.url)'
# copy URL and test:
curl -i "https://<cloud-run-url>/healthz"
```

## 7. Add final GitHub secret for UI pipeline
Set:
- `SCHEDULER_API_BASE_URL=https://<cloud-run-url>`
