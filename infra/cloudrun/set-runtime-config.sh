#!/usr/bin/env bash
set -euo pipefail

# Configure Cloud Run runtime vars and secret bindings.
# Run after the service exists (after first deploy).

PROJECT_ID="${PROJECT_ID:-sling-scheduler}"
REGION="${REGION:-us-east1}"
SERVICE_NAME="${SERVICE_NAME:-sling-scheduler-api}"
NETLIFY_URL="${NETLIFY_URL:-https://sling-scheduler.netlify.app}"

SLING_CALENDAR_ID="${SLING_CALENDAR_ID:-7858}"
SLING_MANAGER_USER_ID="${SLING_MANAGER_USER_ID:-21341367}"
CASPIO_BASE_URL="${CASPIO_BASE_URL:-https://c0ebl152.caspio.com/rest/v2}"
CASPIO_TOKEN_WEBHOOK_URL="${CASPIO_TOKEN_WEBHOOK_URL:-}"

if [[ -z "$CASPIO_TOKEN_WEBHOOK_URL" ]]; then
  echo "Set CASPIO_TOKEN_WEBHOOK_URL before running." >&2
  exit 1
fi

gcloud config set project "$PROJECT_ID" >/dev/null

gcloud run services update "$SERVICE_NAME" \
  --region "$REGION" \
  --update-env-vars "APP_TIMEZONE=America/New_York,SLING_BASE_URL=https://api.getsling.com,SLING_CALENDAR_ID=${SLING_CALENDAR_ID},SLING_MANAGER_USER_ID=${SLING_MANAGER_USER_ID},CASPIO_BASE_URL=${CASPIO_BASE_URL},CASPIO_TOKEN_WEBHOOK_URL=${CASPIO_TOKEN_WEBHOOK_URL},CORS_ALLOWED_ORIGINS=${NETLIFY_URL},REQUEST_TIMEOUT_MS=12000,RETRY_ATTEMPTS=2" \
  --update-secrets "SLING_API_TOKEN=sling-api-token:latest"

echo "Runtime config updated for ${SERVICE_NAME}."
