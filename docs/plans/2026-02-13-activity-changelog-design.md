# Design: Recent Activity & System Change Log

**Date:** 2026-02-13
**Status:** Draft

## Overview

Two new user-facing features for the scheduling UI:

1. **Recent Activity** — displays a live feed of shift updates made through the system, drawn from the `audit_log` Firestore collection.
2. **System Change Log** — displays a curated, non-technical timeline of system improvements, drawn from a static JSON file committed to the repo. Includes an auto-incident indicator when errors occur.

UI layout, component choices, and visual design are deferred to the frontend agent.

---

## Feature 1: Recent Activity

### What it shows

A chronological feed (newest first) of all shift updates made through the system. Each entry displays:

- **Timestamp:** formatted as "February 12, 2026 at 6:10 PM" (America/New_York timezone)
- **Outcome:** visual indicator for success, failure, or partial

**Single team update entry:**
> "Team 1 shifts updated for February 14, 2026"

**Bulk (edit all) update entry:**
> "Bulk edit 4 teams for February 14, 2026"
>
> Expandable to show per-team results:
> - Team 2 (success)
> - Team 3 (success)
> - Team 4 (failed)

### Data source

The `audit_log` Firestore collection (implemented earlier today). Each document contains full request and response payloads.

### Data mapping from audit records

Based on the actual Firestore document structure (see `/workspaces/clownsTesting/audit-log-structure.md`):

| Display field | Source path in audit record |
|---|---|
| Timestamp | `timestamp` (Firestore Timestamp) |
| Outcome | `outcome` field (`"success"` / `"failure"` / `"partial"`) |
| Team name (single) | `body.groups[0].groupId` (e.g., `"Team 25"`) |
| Team count (bulk) | `body.groups.length` |
| Schedule date | `payload.results[N].results[N].data.date` (e.g., `"2026-08-03"`) |
| Per-team name (expanded) | `body.groups[N].groupId` |
| Per-team outcome (expanded) | `payload.results[N].status` |

**Edge case:** If a request failed before shifts were processed (e.g., validation error), `payload.results` may not contain `data.date`. Fallback: omit the date from the display text (show "Team 1 shifts update failed" without a date).

**Single vs. bulk detection:** If `body.groups.length === 1`, display as single team update. If `> 1`, display as bulk edit.

### Backend: new API endpoint

**`GET /api/audit-log`**

Query params:
- `limit` (default 20, max 50) — number of records to return
- `cursor` (optional) — Firestore document ID for cursor-based pagination

The endpoint reads from the `audit_log` Firestore collection, ordered by `timestamp` descending, and maps each raw record to a display-ready object:

```json
{
  "entries": [
    {
      "id": "firestore-doc-id",
      "timestamp": "2026-02-13T18:22:47.568Z",
      "outcome": "success",
      "type": "single",
      "summary": "Team 25 shifts updated for August 3, 2026",
      "scheduleDate": "2026-08-03",
      "requestId": "28779d6c-...",
      "groups": [
        { "groupId": "Team 25", "status": "success" }
      ]
    },
    {
      "id": "firestore-doc-id-2",
      "timestamp": "2026-02-12T21:35:46.000Z",
      "outcome": "partial",
      "type": "bulk",
      "summary": "Bulk edit 4 teams for February 14, 2026",
      "scheduleDate": "2026-02-14",
      "requestId": "bd35292f-...",
      "groups": [
        { "groupId": "Team 1", "status": "failed" },
        { "groupId": "Team 2", "status": "success" },
        { "groupId": "Team 3", "status": "failed" },
        { "groupId": "Team 4", "status": "success" }
      ]
    }
  ],
  "nextCursor": "firestore-doc-id-N"
}
```

The backend does the label derivation — the frontend receives ready-to-render data.

**Firestore query:** `audit_log` collection, ordered by `timestamp` desc, with `limit` and `startAfter(cursor)`. A composite index on `timestamp` descending will be needed (Firestore auto-suggests this on first query).

### Frontend

UI implementation (component choice, layout, icons, styling) is deferred to the frontend agent. The backend provides the data contract above.

---

## Feature 2: System Change Log

### What it shows

A curated, non-technical timeline of system improvements. Written in positive, user-friendly language. Examples:

> **February 13, 2026**
> - Improved how the system tracks and logs scheduling changes for faster issue resolution.
> - Optimized large schedule saves to be more reliable.

> **February 12, 2026**
> - Scheduling saves now process faster with improved performance.
> - Added safeguards to preserve your edits when a save partially succeeds.

### Data source: static JSON file

**`app/ui/public/system-changelog.json`**

The developer curates this file manually. It is committed to the repo and deployed with the UI via Netlify. No backend endpoint needed.

```json
[
  {
    "date": "2026-02-13",
    "entries": [
      "Improved how the system tracks and logs scheduling changes for faster issue resolution.",
      "Optimized large schedule saves to be more reliable."
    ]
  },
  {
    "date": "2026-02-12",
    "entries": [
      "Scheduling saves now process faster with improved performance.",
      "Added safeguards to preserve your edits when a save partially succeeds."
    ]
  }
]
```

**Why static JSON instead of parsing CHANGELOG.md:**
- CHANGELOG.md is technical, markdown-formatted, and not written for end users
- A separate JSON file gives the developer full control over wording and what to include
- No parsing fragility — structure is guaranteed
- Deploys automatically with the UI — no API dependency

### Auto-incident indicator

**Behavior (what it does):**
- When `reportErrorToOps()` fires with a failure or partial outcome, a flag is set in `localStorage`: `{ investigating: true, timestamp: ISO string }`
- The System Change Log button shows a visual indicator (e.g., pulsating glow) to draw user attention
- An auto-generated entry appears at the top of the changelog: _"Investigating an isolated incident that prevented a team from being updated. System remains operational."_
- Opening the System Change Log dismisses the indicator (clears the `localStorage` flag)
- The "Investigating" entry is client-side only — not written to the static JSON file, derived from the `localStorage` flag at render time

**Developer clear:**
- The investigating flag can be cleared on demand by the developer. Mechanism: add an entry to `system-changelog.json` with a `clearInvestigating: true` field. When the frontend loads the changelog and sees this field, it clears the `localStorage` investigating flag. This lets the developer resolve the incident indicator by committing a changelog update — no user action required, no code change needed.

**Visual design** of the indicator and changelog panel is deferred to the frontend agent.

---

## File inventory

### Backend (API)

| File | Action | Purpose |
|---|---|---|
| `services/api/src/routes/audit-log.js` | New | `handleGetAuditLog()` — reads from Firestore, maps to display objects |
| `services/api/src/app.js` | Modify | Register `GET /api/audit-log` route |
| `services/api/test/audit-log-route.test.js` | New | Tests for the new endpoint |

### Frontend (UI)

Files and component structure are deferred to the frontend agent. Key requirements:
- Fetch from `GET /api/audit-log` for recent activity data
- Load `system-changelog.json` from public assets for changelog data
- Modify `app/ui/src/lib/errors.ts` to set `localStorage` investigating flag in `reportErrorToOps()` on failure/partial
- New TypeScript types for activity and changelog data

---

## Two-agent execution split

| Agent | Scope | Dependencies |
|---|---|---|
| **Backend** | New `GET /api/audit-log` endpoint with Firestore query, mapping logic, pagination, and tests. | Depends on existing `audit_log` collection (already deployed). No frontend dependency. |
| **Frontend** | UI for both features, hooks, static JSON, investigating flag logic, all visual/layout decisions. | Depends on backend `GET /api/audit-log` endpoint being available. Can stub the API call during development. |

Backend agent works first (or in parallel with frontend using a stubbed API response).

---

## Considerations

1. **Firestore index.** The `GET /api/audit-log` query (`audit_log` ordered by `timestamp` desc) will require a Firestore index. Firestore logs a helpful error with a direct link to create the index on first failed query. Alternatively, pre-create it in the GCP console.

2. **CORS.** The `GET /api/audit-log` endpoint needs the same CORS headers as existing routes. This is already handled by the route handler pattern in `app.js`.

3. **Pagination.** Cursor-based (not offset-based) to avoid Firestore skip costs. The `nextCursor` is a Firestore document ID passed back to the client.

4. **Schedule date fallback.** If `payload.results` is missing or doesn't contain `data.date` (e.g., request failed at validation), the display text omits the date: "Team 1 shifts update failed" instead of "Team 1 shifts updated for [date]".

5. **Timezone.** Timestamps are stored as Firestore Timestamps (UTC). The backend endpoint returns ISO strings. The frontend formats them in the app's timezone (`America/New_York`).

6. **Static JSON caching.** The browser will cache `system-changelog.json` per Netlify's default static asset headers.

7. **Investigating flag cleanup.** The `localStorage` flag has no automatic expiry. It persists until the user opens the changelog. This is intentional — ensures the user eventually sees the notification.
