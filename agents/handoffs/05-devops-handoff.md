# 05 DevOps Handoff

## What was built
- Cloud Run deployment script and runbook.
- Service config recommendations.
- API Dockerfile and runtime env template.
- GitHub Actions CI workflow for backend tests.
- GitHub Actions Cloud Run deploy workflow (WIF-based auth).
- GitHub Actions Netlify deploy workflow for UI hosting.
- Netlify site config (`netlify.toml`).
- Caspio launcher integration snippet.
- CI/CD prerequisites documentation.
- One-time GCP WIF setup script for GitHub Actions.
- Cloud Run runtime env/secret configuration script.
- Detailed operator guides for GCP and Netlify setup.

## What was validated
- Deployment script is executable.
- Config docs align with project `sling-scheduler` and `us-east1`.
- Backend tests pass after CI workflow addition.

## Open risks/blockers
- Actual GCP deployment not executed yet in this environment (`gcloud` missing locally).
- Secret creation and service variable wiring still required in your project.

## Files changed
- `infra/cloudrun/deploy.sh`
- `infra/cloudrun/README.md`
- `infra/cloudrun/SERVICE_CONFIG.md`
- `services/api/Dockerfile`
- `services/api/.env.example`
- `.github/workflows/api-ci.yml`
- `.github/workflows/deploy-cloud-run.yml`
- `.github/workflows/deploy-ui-netlify.yml`
- `netlify.toml`
- `docs/CI_CD.md`
- `docs/GCP_SETUP.md`
- `docs/NETLIFY_SETUP.md`
- `docs/HOSTING_STRATEGY.md`
- `integrations/caspio/manage-in-sling-launcher.html`
- `infra/cloudrun/setup-github-wif.sh`
- `infra/cloudrun/set-runtime-config.sh`
