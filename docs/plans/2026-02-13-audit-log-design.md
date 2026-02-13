# Design: Append-Only Audit Log for Write Requests

**Date:** 2026-02-13
**Status:** Completed
**Motivation:** Incident `bd35292f` — idempotency records are overwritten on retry and expired by TTL, making failed requests unrecoverable. Cloud Run logs had gaps because the Sling client didn't log failures (now fixed). A durable, append-only audit trail ensures every write request is permanently recorded.

## Decision Summary

- **Approach:** Post-response middleware wrapper (`withAuditLog`) — fire-and-forget Firestore write after the HTTP response is sent.
- **Storage:** Same Firestore database (`sling-scheduler`), new collection `audit_log`.
- **Document IDs:** Auto-generated (never overwritten).
- **Payload detail:** Full request body and full response payload for all requests.
- **Action labels:** Raw technical fields only; frontend derives display labels later.
- **Fallback:** On Firestore write failure, `console.error` the entire audit record as structured JSON so it's captured in Cloud Run logs.

## Scope

All non-GET API requests — currently `PUT /api/shifts/:occurrenceId` and `POST /api/shifts/bulk`. The `POST /api/error-report` route is excluded (it's a reporting endpoint, not a data mutation).

## Architecture

```
Request -> routeRequest() -> withAuditLog(handler, auditStore)
  -> handler executes (idempotency + business logic)
  -> response sent to user
  -> fire-and-forget: auditStore.record({...})
  -> on failure: console.error(full audit payload as structured JSON)
```

The audit write is not awaited. The user never waits for it. The `.catch()` on the audit promise logs the full record to stderr if Firestore is unavailable, so the data is never truly lost.

## Audit Record Schema

```js
{
  // Identity
  requestId: "bd35292f-...",
  idempotencyKey: "user-supplied-key",  // null if absent

  // Request
  method: "POST",
  path: "/api/shifts/bulk",
  body: { /* full request body */ },

  // Response
  statusCode: 200,
  payload: { /* full response payload */ },

  // Timing
  durationMs: 1247,
  timestamp: Firestore.Timestamp,

  // Audit metadata
  outcome: "success" | "failure" | "partial",
  auditWriteStatus: "ok"
}
```

### Outcome derivation

- `"success"` — statusCode 200 and no failed groups/items in payload.
- `"failure"` — non-200 statusCode, or all groups/items failed.
- `"partial"` — statusCode 200 but mixed success/failure in bulk results.

## Configuration

Reuses existing Firestore connection config (`IDEMPOTENCY_PROJECT_ID`, `IDEMPOTENCY_DATABASE_ID`).

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUDIT_COLLECTION` | `audit_log` | Firestore collection name |

## Files

| File | Action | Purpose |
|------|--------|---------|
| `services/api/src/middleware/audit.js` | New | `createAuditStore(env)` and `withAuditLog(handler, auditStore)` |
| `services/api/src/config/env.js` | Modify | Add `auditCollection` env var |
| `services/api/src/app.js` | Modify | Initialize audit store, wrap PUT and POST handlers |
| `services/api/test/audit.test.js` | New | Unit tests for audit store and wrapper |

## Failure Safety

1. Audit Firestore write fails -> `.catch()` fires -> `console.error` with `level: 'error'`, `msg: 'audit_write_failed'`, plus the full audit record fields and the Firestore error message.
2. Cloud Run structured logging captures stderr, so the record is preserved in GCP logs even if Firestore is completely down.
3. A failed audit write never blocks, delays, or errors the user's request.

## Future: Recent Activity Feature

The `audit_log` collection is designed to support a future frontend "Recent Activity" view. The `outcome` field enables filtering without parsing full payloads. The `timestamp` field enables ordering. No TTL policy should be set on this collection — records are permanent.
