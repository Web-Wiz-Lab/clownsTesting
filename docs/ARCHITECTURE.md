# Architecture Overview

## Components
- `app/ui`: Browser client for scheduling coordinators.
- `services/api`: Cloud Run HTTP API.
  - `src/app.js`: request-handler factory for testability and dependency injection.
- `infra/cloudrun`: deployment and operations runbook.

## Data Flow
1. UI reads `?date=MM/DD/YYYY` from Caspio and converts to ISO.
2. UI calls `GET /api/schedule?date=YYYY-MM-DD`.
3. API fetches Sling shifts + Caspio mappings, then returns normalized teams/unmatched shifts.
4. UI sends updates to API (`PUT /api/shifts/:occurrenceId` or `POST /api/shifts/bulk`).
5. API fetches current occurrence, applies time/status edits, and updates Sling occurrence only.

## Safety Rules
- Frontend never stores Sling/Caspio credentials.
- Backend is the only Sling caller.
- Occurrence ID must include `:<date>` suffix.
- Bulk updates return per-item results for partial success.
- Write routes enforce CORS origin allowlist in production mode.
- Timezone baseline is `America/New_York`.

## Debugging Design
- Every response includes `requestId`.
- Sling request metadata is logged in structured JSON.
- Conflict payloads are parsed into a stable shape for UI consumption.
