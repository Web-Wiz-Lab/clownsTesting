#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-sling-scheduler}"
REGION="${REGION:-us-east1}"
SERVICE_NAME="${SERVICE_NAME:-sling-scheduler-api}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${SERVICE_NAME}:$(date +%Y%m%d-%H%M%S)"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required" >&2
  exit 1
fi

gcloud config set project "${PROJECT_ID}" >/dev/null

gcloud run deploy "${SERVICE_NAME}" \
  --source "services/api" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --port 8080

echo "Deployment complete for ${SERVICE_NAME} in ${PROJECT_ID}/${REGION}."
