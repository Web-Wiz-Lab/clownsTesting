#!/usr/bin/env bash
set -euo pipefail

# One-time setup for GitHub Actions -> GCP Workload Identity Federation
# Run from Google Cloud Shell.

PROJECT_ID="${PROJECT_ID:-sling-scheduler}"
PROJECT_NUMBER="${PROJECT_NUMBER:-89502226654}"
REGION="${REGION:-us-east1}"
REPO="${REPO:-Web-Wiz-Lab/clownsTesting}"
POOL_ID="${POOL_ID:-github-pool}"
PROVIDER_ID="${PROVIDER_ID:-github-provider}"
SA_NAME="${SA_NAME:-github-deployer}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required"; exit 1; }

gcloud config set project "$PROJECT_ID" >/dev/null

# Enable required services.
gcloud services enable \
  run.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

# Create deployer service account if missing.
if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Deployer for Sling Scheduler"
fi

# Grant project roles.
for role in \
  roles/run.admin \
  roles/iam.serviceAccountUser \
  roles/artifactregistry.writer \
  roles/cloudbuild.builds.editor
  do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role" >/dev/null
  done

# Create Workload Identity Pool if missing.
if ! gcloud iam workload-identity-pools describe "$POOL_ID" \
  --location="global" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --location="global" \
    --display-name="GitHub Actions Pool"
fi

# Create OIDC provider if missing.
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --location="global" \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub OIDC Provider" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.actor=assertion.actor"
fi

# Allow this repo to impersonate the service account.
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPO}" >/dev/null

WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

echo "Done. Add these GitHub secrets:"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER=${WIF_PROVIDER}"
echo "GCP_SERVICE_ACCOUNT_EMAIL=${SA_EMAIL}"
echo ""
echo "Then run workflow: Deploy API to Cloud Run"
echo "Target region: ${REGION}"
