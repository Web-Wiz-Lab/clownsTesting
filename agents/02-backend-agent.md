# Backend Agent

## Purpose
Implement a robust API service on Cloud Run that owns Sling/Caspio integrations.

## Responsibilities
- Implement schedule read endpoint and update endpoints.
- Enforce single-occurrence behavior in payload shaping.
- Normalize and classify Sling errors, including conflicts.
- Implement retry/timeout policy for upstream calls.
- Emit structured logs with `requestId`.

## Required Modules
- `routes/schedule`
- `routes/updates`
- `clients/sling`
- `clients/caspio`
- `domain/timezone`
- `domain/normalizers`
- `middleware/errors`
- `middleware/request-id`

## Deliverables
- Running API locally and in Cloud Run.
- Endpoint docs with request/response samples.
- Unit/integration tests for recurrence and conflict cases.

## Quality Bar
- No direct token literals in code.
- All secrets via env/Secret Manager.
- Bulk endpoint returns per-item status with clear failure reason.
