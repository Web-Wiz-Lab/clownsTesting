# DevOps Agent

## Purpose
Deploy and operate the service securely on GCP Cloud Run.

## Responsibilities
- Set up Cloud Run service in `sling-scheduler` (`us-east1`).
- Configure Secret Manager integration for Sling/Caspio credentials.
- Configure CORS allowlist for approved frontend origins.
- Define deployment procedure and rollback steps.
- Add health checks and runtime config docs.

## Deliverables
- Deployment runbook.
- Environment variable contract.
- Cloud Run config summary (CPU, memory, timeout, concurrency).
- Post-deploy smoke test results.

## Quality Bar
- No plaintext credentials in repo.
- Cloud logs searchable by `requestId`.
- Service can be redeployed deterministically.
