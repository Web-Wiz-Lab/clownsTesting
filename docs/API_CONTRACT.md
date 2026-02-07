# API Contract

## Headers
- `X-Request-Id` (optional request header): client-provided correlation ID.
- `Idempotency-Key` (optional on write requests): client-generated idempotency token.
  - Current dedupe behavior is implemented for `POST /api/shifts/bulk`.
  - UI sends this header for both bulk `POST` and single-shift `PUT`.

## `GET /healthz`
Response:
```json
{
  "requestId": "...",
  "summary": "ok",
  "service": "sling-scheduler-api",
  "timezone": "America/New_York"
}
```

## `GET /readyz`
Purpose:
- Dependency-aware readiness status for Sling + Caspio.
- Uses short server-side cache to avoid dependency load on every probe.

Query params:
- `refresh=1` or `force=1` to bypass cache and execute fresh checks.

Response (healthy):
```json
{
  "requestId": "...",
  "summary": "ok",
  "service": "sling-scheduler-api",
  "checks": {
    "sling": { "status": "ok", "durationMs": 35 },
    "caspio": { "status": "ok", "durationMs": 72 }
  },
  "checkedAt": "2026-02-07T03:10:00.000Z",
  "cached": false
}
```

Response (degraded):
```json
{
  "requestId": "...",
  "summary": "degraded",
  "service": "sling-scheduler-api",
  "checks": {
    "sling": { "status": "ok", "durationMs": 30 },
    "caspio": {
      "status": "degraded",
      "durationMs": 12003,
      "code": "CASPIO_REQUEST_FAILED",
      "message": "Caspio request failed"
    }
  },
  "checkedAt": "2026-02-07T03:10:00.000Z",
  "cached": false
}
```

Status codes:
- `200` when all checks are healthy.
- `503` when one or more checks are degraded.

## `GET /api/schedule?date=YYYY-MM-DD`
Response:
```json
{
  "requestId": "...",
  "summary": "ok",
  "date": "2026-02-07",
  "timezone": "America/New_York",
  "teams": [],
  "unmatched": [],
  "counts": { "teams": 0, "unmatched": 0, "shifts": 0 }
}
```

## `PUT /api/shifts/:occurrenceId`
Request:
```json
{
  "startTime": "11:30",
  "endTime": "16:30",
  "status": "published"
}
```
Response:
```json
{
  "requestId": "...",
  "summary": "ok",
  "timezone": "America/New_York",
  "data": {
    "occurrenceId": "4738738907:2026-08-10",
    "updatedShift": {}
  }
}
```

## `POST /api/shifts/bulk`
Preferred request (grouped atomic mode):
```json
{
  "groups": [
    {
      "groupId": "Team 1",
      "atomic": true,
      "updates": [
        {
          "occurrenceId": "4738748479",
          "startTime": "13:00",
          "endTime": "16:00",
          "status": "published"
        },
        {
          "occurrenceId": "4738738907:2026-08-10",
          "startTime": "13:00",
          "endTime": "16:00",
          "status": "published"
        }
      ]
    }
  ]
}
```

Grouped response:
```json
{
  "requestId": "...",
  "mode": "grouped",
  "summary": "partial_success",
  "timezone": "America/New_York",
  "counts": { "total": 2, "success": 1, "failed": 1 },
  "results": [
    {
      "index": 0,
      "groupId": "Team 1",
      "status": "failed",
      "atomic": true,
      "rolledBack": true,
      "counts": { "total": 2, "success": 0, "failed": 2 },
      "failure": {
        "code": "SLING_REQUEST_FAILED",
        "message": "Sling request failed"
      }
    }
  ]
}
```

Legacy flat request (still supported):
```json
{
  "updates": [
    {
      "occurrenceId": "4738738907:2026-08-10",
      "startTime": "11:30",
      "endTime": "16:30",
      "status": "published"
    }
  ]
}
```

Flat response:
```json
{
  "requestId": "...",
  "mode": "flat",
  "summary": "partial_success",
  "timezone": "America/New_York",
  "counts": { "total": 1, "success": 0, "failed": 1 },
  "results": [
    {
      "index": 0,
      "occurrenceId": "4738738907:2026-08-10",
      "status": "failed",
      "error": {
        "code": "SLING_REQUEST_FAILED",
        "message": "Sling request failed",
        "details": {},
        "conflicts": []
      }
    }
  ]
}
```

## `POST /api/error-report`
Purpose:
- Receives UI-side error reports for operational alerting.
- Forwards to webhook defined by `ERROR_REPORT_WEBHOOK_URL`.

Request:
```json
{
  "action": "update_team_request_failed",
  "userMessage": "Could not update this team.",
  "occurredAt": "2026-02-06T22:23:19.000Z",
  "error": {
    "code": "SLING_REQUEST_FAILED",
    "message": "Sling request failed",
    "requestId": "manual-test-1770416599",
    "status": 409,
    "details": {}
  },
  "context": {
    "selectedDate": "2026-02-08",
    "teamName": "Team 1"
  },
  "client": {
    "url": "https://sling-scheduler.netlify.app",
    "timezone": "America/New_York"
  }
}
```

Response:
```json
{
  "requestId": "...",
  "summary": "ok",
  "data": {
    "triggered": true,
    "webhookStatus": 200
  }
}
```

## Error Envelope
All error responses return:
```json
{
  "requestId": "...",
  "summary": "failed",
  "error": {
    "code": "ORIGIN_NOT_ALLOWED",
    "message": "Origin is not allowed by CORS policy",
    "details": {}
  }
}
```
