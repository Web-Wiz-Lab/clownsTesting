# API Contract

## Headers
- `X-Request-Id` (optional request header): client-provided correlation ID.
- `Idempotency-Key` (optional on `POST /api/shifts/bulk`): deduplicates repeat bulk submissions for a short TTL.

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
Request:
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
Response:
```json
{
  "requestId": "...",
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
