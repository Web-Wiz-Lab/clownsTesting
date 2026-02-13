# Activity & Changelog Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Required Reading

Read these files before starting implementation:

**Design docs:**
- `docs/plans/2026-02-13-activity-changelog-design.md` — feature design and API contract
- `docs/plans/2026-02-13-audit-log-design.md` — audit log architecture (this plan builds on it)
- `/workspaces/clownsTesting/audit-log-structure.md` — real Firestore document structure from production

**Core system files:**
- `services/api/src/middleware/audit.js` — audit store (needs `query()` method added)
- `services/api/src/app.js` — route registration (new GET route goes here)
- `services/api/src/config/env.js` — environment config
- `services/api/src/middleware/errors.js` — `ApiError` class
- `services/api/src/utils/http.js` — `sendJson`, `getPathAndQuery`

**Test conventions:**
- `services/api/test/audit.test.js` — existing audit store tests (extend these)
- `services/api/test/http-routes.test.js` — integration test patterns (`buildEnv`, `runHandler`)
- Uses `node:test` runner, no external framework. Run with `node --test`.

**Data mapping reference (from real Firestore record):**

| Display field | Source path in audit record |
|---|---|
| Timestamp | `timestamp` (Firestore Timestamp) |
| Outcome | `outcome` (`"success"` / `"failure"` / `"partial"`) |
| Team name (single) | `body.groups[0].groupId` |
| Team count (bulk) | `body.groups.length` |
| Schedule date | `payload.results[N].results[N].data.date` |
| Per-team name (expanded) | `body.groups[N].groupId` |
| Per-team outcome (expanded) | `payload.results[N].status` |
| Single vs bulk | `body.groups.length === 1` → single, `> 1` → bulk |

---

**Goal:** Add `GET /api/audit-log` endpoint that returns display-ready activity entries from the `audit_log` Firestore collection, and create the initial `system-changelog.json` static file for the frontend.

**Architecture:** Extend the existing audit store with a `query()` method. Create a new route handler that calls `query()`, maps raw records to the API response contract defined in the design doc, and returns paginated results.

**Tech Stack:** Node.js 20+, `node:test`, `@google-cloud/firestore` (already installed), ESM modules.

---

### Task 1: Extend audit store with `query()` method

The current audit store (`services/api/src/middleware/audit.js`) only has `record()`. Add a `query({ limit, cursor })` method to both memory and Firestore backends.

**Files:**
- Modify: `services/api/src/middleware/audit.js`
- Modify: `services/api/test/audit.test.js`

**Step 1: Write failing tests for `query()`**

Add to `services/api/test/audit.test.js`:

```js
test('memory audit store query returns entries newest-first', async () => {
  const store = await createAuditStore({ auditBackend: 'memory' });

  await store.record({ requestId: 'req-1', method: 'PUT', path: '/api/shifts/a', statusCode: 200, payload: {}, durationMs: 10, outcome: 'success' });
  await store.record({ requestId: 'req-2', method: 'POST', path: '/api/shifts/bulk', statusCode: 200, payload: {}, durationMs: 20, outcome: 'success' });
  await store.record({ requestId: 'req-3', method: 'PUT', path: '/api/shifts/b', statusCode: 409, payload: {}, durationMs: 30, outcome: 'failure' });

  const result = await store.query({ limit: 2 });

  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].requestId, 'req-3');
  assert.equal(result.entries[1].requestId, 'req-2');
  assert.ok(result.nextCursor);
});

test('memory audit store query supports cursor pagination', async () => {
  const store = await createAuditStore({ auditBackend: 'memory' });

  await store.record({ requestId: 'req-1', method: 'PUT', path: '/a', statusCode: 200, payload: {}, durationMs: 10, outcome: 'success' });
  await store.record({ requestId: 'req-2', method: 'PUT', path: '/b', statusCode: 200, payload: {}, durationMs: 20, outcome: 'success' });
  await store.record({ requestId: 'req-3', method: 'PUT', path: '/c', statusCode: 200, payload: {}, durationMs: 30, outcome: 'success' });

  const page1 = await store.query({ limit: 2 });
  assert.equal(page1.entries.length, 2);
  assert.equal(page1.entries[0].requestId, 'req-3');

  const page2 = await store.query({ limit: 2, cursor: page1.nextCursor });
  assert.equal(page2.entries.length, 1);
  assert.equal(page2.entries[0].requestId, 'req-1');
  assert.equal(page2.nextCursor, null);
});

test('memory audit store query returns empty when no entries', async () => {
  const store = await createAuditStore({ auditBackend: 'memory' });
  const result = await store.query({ limit: 10 });
  assert.equal(result.entries.length, 0);
  assert.equal(result.nextCursor, null);
});
```

**Step 2: Run tests, verify new tests fail**

Run: `cd /workspaces/clownsTesting/services/api && node --test test/audit.test.js`

**Step 3: Implement `query()` on the memory store**

In `createMemoryAuditStore()`, add after the `record` method:

```js
async query({ limit = 20, cursor = null }) {
  const sorted = [...entries].reverse();
  let startIndex = 0;
  if (cursor) {
    const cursorIndex = sorted.findIndex((e, i) => String(i) === cursor);
    startIndex = cursorIndex >= 0 ? cursorIndex : 0;
  }
  const page = sorted.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < sorted.length;
  return {
    entries: page,
    nextCursor: hasMore ? String(startIndex + limit) : null
  };
}
```

Also add `query()` to the Firestore store. This is the production implementation:

```js
async query({ limit = 20, cursor = null }) {
  let q = ref.orderBy('timestamp', 'desc').limit(limit);
  if (cursor) {
    const cursorDoc = await ref.doc(cursor).get();
    if (cursorDoc.exists) {
      q = q.startAfter(cursorDoc);
    }
  }
  const snapshot = await q.get();
  const entries = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
  const lastDoc = snapshot.docs[snapshot.docs.length - 1];
  return {
    entries,
    nextCursor: entries.length === limit && lastDoc ? lastDoc.id : null
  };
}
```

**Step 4: Run tests, verify all pass**

Run: `cd /workspaces/clownsTesting/services/api && node --test test/audit.test.js`

---

### Task 2: Create mapping functions and route handler with tests

Create the route handler that reads from the audit store, maps raw records to the display-ready API response contract, and handles pagination.

**Files:**
- Create: `services/api/src/routes/audit-log.js`
- Create: `services/api/test/audit-log-route.test.js`

**Step 1: Write the mapping functions and route handler**

Create `services/api/src/routes/audit-log.js`:

The module exports:
- `mapAuditEntry(raw)` — transforms a raw audit record into a display-ready object (exported for testing)
- `extractScheduleDate(payload)` — extracts the schedule date from nested response payload (exported for testing)
- `handleGetAuditLog({ auditStorePromise, query, requestId })` — route handler

**`mapAuditEntry(raw)` logic:**

```js
export function extractScheduleDate(payload) {
  // Dig into payload.results[N].results[N].data.date
  const results = Array.isArray(payload?.results) ? payload.results : [];
  for (const group of results) {
    const groupResults = Array.isArray(group?.results) ? group.results : [];
    for (const item of groupResults) {
      if (item?.data?.date) {
        return item.data.date;
      }
    }
  }
  return null;
}

export function mapAuditEntry(raw) {
  const groups = Array.isArray(raw.body?.groups) ? raw.body.groups : [];
  const isBulk = groups.length > 1;
  const scheduleDate = extractScheduleDate(raw.payload);
  const payloadResults = Array.isArray(raw.payload?.results) ? raw.payload.results : [];

  const groupDetails = groups.map((g, i) => ({
    groupId: g.groupId || `Group ${i + 1}`,
    status: payloadResults[i]?.status || 'unknown'
  }));

  const formattedDate = scheduleDate
    ? new Date(scheduleDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  let summary;
  if (isBulk) {
    summary = `Bulk edit ${groups.length} teams` + (formattedDate ? ` for ${formattedDate}` : '');
  } else if (groups.length === 1) {
    const teamName = groups[0].groupId || 'Unknown team';
    summary = `${teamName} shifts updated` + (formattedDate ? ` for ${formattedDate}` : '');
  } else {
    summary = 'Shift update';
  }

  return {
    id: raw.id || raw.requestId,
    timestamp: raw.timestamp instanceof Date ? raw.timestamp.toISOString() : String(raw.timestamp || ''),
    outcome: raw.outcome || 'unknown',
    type: isBulk ? 'bulk' : 'single',
    summary,
    scheduleDate: scheduleDate || null,
    requestId: raw.requestId || null,
    groups: groupDetails
  };
}
```

**`handleGetAuditLog` logic:**

```js
export async function handleGetAuditLog({ auditStorePromise, query, requestId }) {
  const limitRaw = parseInt(query.get('limit') || '20', 10);
  const limit = Math.min(Math.max(limitRaw || 20, 1), 50);
  const cursor = query.get('cursor') || null;

  const store = await auditStorePromise;
  const result = await store.query({ limit, cursor });

  return {
    requestId,
    entries: result.entries.map(mapAuditEntry),
    nextCursor: result.nextCursor
  };
}
```

**Step 2: Write tests**

Create `services/api/test/audit-log-route.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { mapAuditEntry, extractScheduleDate } from '../src/routes/audit-log.js';
```

Test `extractScheduleDate`:
- Returns date string from nested `payload.results[0].results[0].data.date`
- Returns `null` when payload has no results
- Returns `null` when results exist but no `data.date`

Test `mapAuditEntry`:
- Single team: `body.groups.length === 1` → `type: 'single'`, summary includes team name and formatted date
- Bulk: `body.groups.length > 1` → `type: 'bulk'`, summary includes team count and formatted date
- Missing date: summary text omits date portion
- Group details: maps `groupId` and `status` from `payload.results`
- Timestamp: Date object converted to ISO string

Use the real Firestore document structure from `audit-log-structure.md` as the basis for test fixtures. Build a fixture that mirrors lines 1-168 of that file.

**Step 3: Run tests, verify all pass**

Run: `cd /workspaces/clownsTesting/services/api && node --test test/audit-log-route.test.js`

---

### Task 3: Wire route into app.js and integration test

**Files:**
- Modify: `services/api/src/app.js`
- Modify: `services/api/test/audit-log-route.test.js` (add integration test)

**Step 1: Add import and route**

In `services/api/src/app.js`, add import:

```js
import { handleGetAuditLog } from './routes/audit-log.js';
```

Add the route inside `routeRequest()`, after the `GET /api/schedule` block and before the `PUT /api/shifts/` block:

```js
if (req.method === 'GET' && path === '/api/audit-log') {
  const payload = await handleGetAuditLog({
    auditStorePromise,
    query,
    requestId
  });
  sendJson(res, 200, payload, baseHeaders);
  return;
}
```

**Step 2: Write integration test**

Add to `services/api/test/audit-log-route.test.js`:

An integration test that:
1. Creates a memory audit store with `createAuditStore({ auditBackend: 'memory' })`
2. Records 2-3 audit entries (one single team, one bulk)
3. Creates a request handler with `createRequestHandler({ env, ..., auditStore })`
4. Sends `GET /api/audit-log` using the `runHandler` pattern from `http-routes.test.js`
5. Asserts: response is 200, `entries` array has correct length, first entry has expected `type`, `summary`, `outcome`, `groups`
6. Tests pagination: sends with `?limit=1`, gets `nextCursor`, sends second request with `?cursor=...`, gets remaining entries

**Step 3: Run full test suite**

Run: `cd /workspaces/clownsTesting/services/api && node --test`
Expected: All tests pass (existing 41 + new audit-log-route tests)

---

### Task 4: Create system-changelog.json and final validation

**Files:**
- Create: `app/ui/public/system-changelog.json`
- Modify: `docs/operations/CHANGELOG.md` (add entry)

**Step 1: Create the public directory if needed and initial JSON**

Create `app/ui/public/system-changelog.json` with initial entries derived from recent CHANGELOG.md work. Write in positive, non-technical language:

```json
[
  {
    "date": "2026-02-13",
    "entries": [
      "Improved how the system tracks and logs scheduling changes for faster issue resolution.",
      "Optimized large schedule saves to be more reliable.",
      "Added a new activity tracking system to record all scheduling changes."
    ]
  },
  {
    "date": "2026-02-12",
    "entries": [
      "Scheduling saves now process faster with improved performance.",
      "Added safeguards to preserve your edits when a save partially succeeds.",
      "Improved system resilience for more reliable schedule updates."
    ]
  },
  {
    "date": "2026-02-10",
    "entries": [
      "Fixed an issue where the app could briefly show a blank screen while loading schedule data.",
      "Improved how the app connects to the scheduling service."
    ]
  }
]
```

**Step 2: Run full validation**

Run: `cd /workspaces/clownsTesting/services/api && node --test`
Expected: All tests pass

Run: `cd /workspaces/clownsTesting/app/ui && npm run lint && npm run build`
Expected: Clean lint, successful build

**Step 3: Update changelog**

Add a brief entry to the `2026-02-13` section of `docs/operations/CHANGELOG.md` noting the new `GET /api/audit-log` endpoint and the initial `system-changelog.json` file.
