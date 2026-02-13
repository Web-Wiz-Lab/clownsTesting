# Audit Log Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Required Reading

Read these files before starting implementation to understand the system context:

**Design & operations docs:**
- `docs/plans/2026-02-13-audit-log-design.md` — approved design doc for this feature
- `docs/operations/INCIDENT_REPORT.md` — incident that motivated this work (search for `bd35292f`)
- `docs/operations/CHANGELOG.md` — project changelog (update after implementation)

**Core system files (implementation targets):**
- `services/api/src/app.js` — request handler, route definitions, idempotency integration (PUT lines 331-366, POST lines 368-398)
- `services/api/src/config/env.js` — environment variable loading
- `services/api/src/middleware/idempotency.js` — existing Firestore store pattern to follow (especially `createFirestoreIdempotencyStore` lines 132-236)
- `services/api/src/middleware/errors.js` — `ApiError` class used throughout
- `services/api/src/middleware/request-id.js` — request ID extraction
- `services/api/src/routes/updates.js` — bulk/single update logic, `CONCURRENCY`, outcome semantics
- `services/api/src/clients/sling.js` — Sling HTTP client with structured logging pattern to match

**Test files (conventions to follow):**
- `services/api/test/idempotency.test.js` — memory store test pattern
- `services/api/test/http-routes.test.js` — integration test helpers (`buildEnv`, `buildClients`, `runHandler`)
- `services/api/package.json` — uses `node:test` runner (`node --test`), no external test framework

---

**Goal:** Add an append-only Firestore audit log that records every PUT/POST write request with full request and response payloads, independent of the idempotency store.

**Architecture:** A `withAuditLog()` wrapper in new `middleware/audit.js` wraps write route handlers in `app.js`. After the response is sent to the user, it fires a non-blocking Firestore write to an `audit_log` collection. On Firestore failure, `console.error` logs the full audit record as structured JSON so Cloud Run captures it.

**Tech Stack:** Node.js 20+, `node:test`, `@google-cloud/firestore` (already installed), ESM modules.

---

### Task 1: Add `auditCollection` env var

**Files:**
- Modify: `services/api/src/config/env.js:46`

**Step 1: Add the env var**

In `services/api/src/config/env.js`, add after line 46 (`idempotencyDatabaseId`):

```js
    auditCollection: process.env.AUDIT_COLLECTION || 'audit_log'
```

**Step 2: Verify API starts**

Run: `cd /workspaces/clownsTesting/services/api && node -e "import('./src/config/env.js').then(m => { process.env.SLING_API_TOKEN='x'; process.env.SLING_CALENDAR_ID='x'; process.env.SLING_MANAGER_USER_ID='x'; process.env.CASPIO_BASE_URL='x'; process.env.CASPIO_ACCESS_TOKEN='x'; console.log(m.loadEnv().auditCollection); })"`
Expected: `audit_log`

---

### Task 2: Create `deriveOutcome` helper and test it

**Files:**
- Create: `services/api/src/middleware/audit.js`
- Create: `services/api/test/audit.test.js`

**Step 1: Write failing tests for `deriveOutcome`**

Create `services/api/test/audit.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveOutcome } from '../src/middleware/audit.js';

test('deriveOutcome returns "failure" for non-200 status', () => {
  assert.equal(deriveOutcome(500, {}), 'failure');
  assert.equal(deriveOutcome(400, {}), 'failure');
  assert.equal(deriveOutcome(409, {}), 'failure');
});

test('deriveOutcome returns "success" for 200 with no results array', () => {
  assert.equal(deriveOutcome(200, { requestId: 'r1', summary: 'ok' }), 'success');
});

test('deriveOutcome returns "success" for 200 with all-success results', () => {
  const payload = {
    summary: 'ok',
    results: [
      { status: 'success' },
      { status: 'success' }
    ]
  };
  assert.equal(deriveOutcome(200, payload), 'success');
});

test('deriveOutcome returns "failure" for 200 with all-failed results', () => {
  const payload = {
    summary: 'failed',
    results: [
      { status: 'failed', error: { code: 'SLING_REQUEST_FAILED' } },
      { status: 'failed', error: { code: 'SLING_REQUEST_FAILED' } }
    ]
  };
  assert.equal(deriveOutcome(200, payload), 'failure');
});

test('deriveOutcome returns "partial" for 200 with mixed results', () => {
  const payload = {
    summary: 'partial',
    results: [
      { status: 'success' },
      { status: 'failed', error: { code: 'SLING_REQUEST_FAILED' } }
    ]
  };
  assert.equal(deriveOutcome(200, payload), 'partial');
});

test('deriveOutcome returns "success" for single-update 200', () => {
  const payload = { requestId: 'r1', data: { id: '123' } };
  assert.equal(deriveOutcome(200, payload), 'success');
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /workspaces/clownsTesting/services/api && node --test test/audit.test.js`
Expected: FAIL — module `../src/middleware/audit.js` does not exist.

**Step 3: Write minimal `deriveOutcome` implementation**

Create `services/api/src/middleware/audit.js`:

```js
export function deriveOutcome(statusCode, payload) {
  if (statusCode !== 200) {
    return 'failure';
  }

  const results = Array.isArray(payload?.results) ? payload.results : null;
  if (!results) {
    return 'success';
  }

  const hasSuccess = results.some((r) => r.status === 'success');
  const hasFailure = results.some((r) => r.status !== 'success');

  if (hasSuccess && hasFailure) return 'partial';
  if (hasFailure) return 'failure';
  return 'success';
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /workspaces/clownsTesting/services/api && node --test test/audit.test.js`
Expected: 6/6 PASS

---

### Task 3: Create `createAuditStore` with memory backend and test it

This task adds the audit store factory with a memory backend (for testing) and a Firestore backend (for production). The memory backend is a simple array that captures records for assertion in tests.

**Files:**
- Modify: `services/api/src/middleware/audit.js`
- Modify: `services/api/test/audit.test.js`

**Step 1: Write failing tests for the memory audit store**

Append to `services/api/test/audit.test.js`:

```js
import { createAuditStore } from '../src/middleware/audit.js';

test('memory audit store records entries and exposes them', async () => {
  const store = await createAuditStore({ auditBackend: 'memory' });
  const entry = {
    requestId: 'req-1',
    idempotencyKey: null,
    method: 'PUT',
    path: '/api/shifts/123',
    body: { startTime: '09:00' },
    statusCode: 200,
    payload: { requestId: 'req-1', data: { id: '123' } },
    durationMs: 150,
    outcome: 'success'
  };

  await store.record(entry);

  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].requestId, 'req-1');
  assert.equal(store.entries[0].auditWriteStatus, 'ok');
  assert.ok(store.entries[0].timestamp instanceof Date);
});

test('memory audit store appends multiple records with unique IDs', async () => {
  const store = await createAuditStore({ auditBackend: 'memory' });

  await store.record({ requestId: 'req-1', method: 'PUT', path: '/a', statusCode: 200, payload: {}, durationMs: 10, outcome: 'success' });
  await store.record({ requestId: 'req-2', method: 'POST', path: '/b', statusCode: 409, payload: {}, durationMs: 20, outcome: 'failure' });

  assert.equal(store.entries.length, 2);
  assert.equal(store.entries[0].requestId, 'req-1');
  assert.equal(store.entries[1].requestId, 'req-2');
});
```

**Step 2: Run tests to verify new tests fail**

Run: `cd /workspaces/clownsTesting/services/api && node --test test/audit.test.js`
Expected: New tests FAIL — `createAuditStore` is not exported.

**Step 3: Implement `createAuditStore` with memory backend**

Add to `services/api/src/middleware/audit.js`:

```js
const DEFAULT_AUDIT_COLLECTION = 'audit_log';

export async function createAuditStore(env = {}) {
  const backend = String(env.auditBackend || env.idempotencyBackend || 'memory').toLowerCase();

  if (backend === 'firestore') {
    return createFirestoreAuditStore(env);
  }

  return createMemoryAuditStore();
}

function createMemoryAuditStore() {
  const entries = [];

  return {
    entries,
    async record(entry) {
      entries.push({
        ...entry,
        timestamp: new Date(),
        auditWriteStatus: 'ok'
      });
    }
  };
}

async function createFirestoreAuditStore(env) {
  const module = await import('@google-cloud/firestore');
  const Firestore = module.Firestore || module.default?.Firestore;

  if (!Firestore) {
    throw new Error('Firestore SDK is unavailable for audit backend');
  }

  const firestoreOptions = {};
  const projectId = env.idempotencyProjectId || '';
  const databaseId = env.idempotencyDatabaseId || '';
  if (projectId) firestoreOptions.projectId = projectId;
  if (databaseId) firestoreOptions.databaseId = databaseId;

  const db = Object.keys(firestoreOptions).length > 0
    ? new Firestore(firestoreOptions)
    : new Firestore();
  const collection = env.auditCollection || DEFAULT_AUDIT_COLLECTION;
  const ref = db.collection(collection);

  return {
    async record(entry) {
      await ref.add({
        ...entry,
        timestamp: new Date(),
        auditWriteStatus: 'ok'
      });
    }
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /workspaces/clownsTesting/services/api && node --test test/audit.test.js`
Expected: All tests PASS

---

### Task 4: Create `withAuditLog` wrapper and test it

**Files:**
- Modify: `services/api/src/middleware/audit.js`
- Modify: `services/api/test/audit.test.js`

**Step 1: Write failing tests for `withAuditLog`**

Append to `services/api/test/audit.test.js`:

```js
import { withAuditLog } from '../src/middleware/audit.js';

test('withAuditLog records successful write and returns result', async () => {
  const store = await createAuditStore({ auditBackend: 'memory' });
  const result = await withAuditLog({
    auditStore: store,
    requestId: 'req-1',
    idempotencyKey: 'idem-1',
    method: 'PUT',
    path: '/api/shifts/123',
    body: { startTime: '09:00' },
    execute: async () => ({ statusCode: 200, payload: { requestId: 'req-1', data: { id: '123' } } })
  });

  assert.equal(result.statusCode, 200);

  // Allow fire-and-forget to settle
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].outcome, 'success');
  assert.equal(store.entries[0].method, 'PUT');
  assert.equal(store.entries[0].idempotencyKey, 'idem-1');
  assert.ok(store.entries[0].durationMs >= 0);
});

test('withAuditLog records failed write and returns result', async () => {
  const store = await createAuditStore({ auditBackend: 'memory' });
  const result = await withAuditLog({
    auditStore: store,
    requestId: 'req-2',
    idempotencyKey: null,
    method: 'POST',
    path: '/api/shifts/bulk',
    body: { groups: [] },
    execute: async () => ({ statusCode: 409, payload: { requestId: 'req-2', summary: 'failed' } })
  });

  assert.equal(result.statusCode, 409);

  await new Promise((r) => setTimeout(r, 10));

  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].outcome, 'failure');
  assert.equal(store.entries[0].idempotencyKey, null);
});

test('withAuditLog does not block on audit store failure', async () => {
  const errorLogs = [];
  const originalError = console.error;
  console.error = (...args) => errorLogs.push(args);

  try {
    const failingStore = {
      async record() { throw new Error('Firestore is down'); }
    };

    const result = await withAuditLog({
      auditStore: failingStore,
      requestId: 'req-3',
      idempotencyKey: null,
      method: 'PUT',
      path: '/api/shifts/456',
      body: {},
      execute: async () => ({ statusCode: 200, payload: { requestId: 'req-3', data: {} } })
    });

    assert.equal(result.statusCode, 200);

    await new Promise((r) => setTimeout(r, 10));

    assert.ok(errorLogs.length >= 1, 'should have logged audit failure');
    const logEntry = JSON.parse(errorLogs[0][0]);
    assert.equal(logEntry.level, 'error');
    assert.equal(logEntry.msg, 'audit_write_failed');
    assert.equal(logEntry.requestId, 'req-3');
    assert.equal(logEntry.auditError, 'Firestore is down');
    // Verify the full audit record is in the fallback log
    assert.equal(logEntry.method, 'PUT');
    assert.equal(logEntry.path, '/api/shifts/456');
    assert.equal(logEntry.statusCode, 200);
  } finally {
    console.error = originalError;
  }
});

test('withAuditLog still returns result when execute throws', async () => {
  const store = await createAuditStore({ auditBackend: 'memory' });
  await assert.rejects(
    () => withAuditLog({
      auditStore: store,
      requestId: 'req-4',
      method: 'PUT',
      path: '/api/shifts/789',
      body: {},
      execute: async () => { throw new Error('handler crashed'); }
    }),
    { message: 'handler crashed' }
  );

  await new Promise((r) => setTimeout(r, 10));

  // No audit record for unhandled crashes — those are caught by app.js error handler
  assert.equal(store.entries.length, 0);
});
```

**Step 2: Run tests to verify new tests fail**

Run: `cd /workspaces/clownsTesting/services/api && node --test test/audit.test.js`
Expected: New tests FAIL — `withAuditLog` is not exported.

**Step 3: Implement `withAuditLog`**

Add to `services/api/src/middleware/audit.js`:

```js
export async function withAuditLog({
  auditStore,
  requestId,
  idempotencyKey = null,
  method,
  path,
  body,
  execute
}) {
  const startedAt = Date.now();
  const result = await execute();
  const durationMs = Date.now() - startedAt;

  const entry = {
    requestId,
    idempotencyKey: idempotencyKey || null,
    method,
    path,
    body,
    statusCode: result.statusCode,
    payload: result.payload,
    durationMs,
    outcome: deriveOutcome(result.statusCode, result.payload)
  };

  auditStore.record(entry).catch((err) => {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'audit_write_failed',
        ...entry,
        auditError: err?.message || String(err)
      })
    );
  });

  return result;
}
```

**Step 4: Run tests to verify they all pass**

Run: `cd /workspaces/clownsTesting/services/api && node --test test/audit.test.js`
Expected: All tests PASS

---

### Task 5: Wire audit store into `app.js`

**Files:**
- Modify: `services/api/src/app.js:1-9` (imports)
- Modify: `services/api/src/app.js:224-239` (createRequestHandler params and init)
- Modify: `services/api/src/app.js:331-397` (PUT and POST route handlers)

**Step 1: Add import**

At `services/api/src/app.js:1`, add to imports:

```js
import { createAuditStore, withAuditLog } from './middleware/audit.js';
```

**Step 2: Add `auditStore` parameter and initialization**

In `createRequestHandler` (line 224), add `auditStore = null` to the params:

```js
export function createRequestHandler({
  env,
  slingClient,
  caspioClient,
  errorReporterClient = null,
  idempotencyStore = null,
  auditStore = null
}) {
```

After the `idempotencyStorePromise` initialization (line 239), add:

```js
  const auditStorePromise = auditStore
    ? Promise.resolve(auditStore)
    : createAuditStore(env);
```

**Step 3: Wrap PUT handler with audit logging**

Replace the PUT route block (lines 331-366) so that after `executeIdempotentWrite`, the result goes through `withAuditLog`. The key change: wrap the entire idempotent-write + send into the audit flow.

The PUT handler (lines 331-366) becomes:

```js
      if (req.method === 'PUT' && path.startsWith('/api/shifts/')) {
        const encodedId = path.replace('/api/shifts/', '');
        const occurrenceId = decodeURIComponent(encodedId);
        const body = (await readRequestBodySafely(req, requestId)) || {};
        const idempotencyKey = normalizeIdempotencyKey(req.headers['idempotency-key']);
        const result = await executeIdempotentWrite({
          idempotencyStorePromise,
          idempotencyKey,
          method: req.method,
          path,
          body,
          requestId,
          execute: async () => {
            try {
              const payload = await updateSingleOccurrence({
                occurrenceId,
                payload: body,
                slingClient,
                env,
                requestId
              });
              return { statusCode: 200, payload };
            } catch (error) {
              if (error instanceof ApiError) {
                return {
                  statusCode: error.statusCode || 400,
                  payload: normalizeSingleUpdateError(occurrenceId, error, requestId)
                };
              }
              throw error;
            }
          }
        });
        sendJson(res, result.statusCode, result.payload, baseHeaders);

        const resolvedAuditStore = await auditStorePromise;
        resolvedAuditStore.record({
          requestId,
          idempotencyKey: idempotencyKey || null,
          method: req.method,
          path,
          body,
          statusCode: result.statusCode,
          payload: result.payload,
          durationMs: Date.now() - Date.now(),
          outcome: (await import('./middleware/audit.js')).deriveOutcome(result.statusCode, result.payload)
        }).catch((err) => {
          console.error(JSON.stringify({
            level: 'error',
            msg: 'audit_write_failed',
            requestId,
            method: req.method,
            path,
            statusCode: result.statusCode,
            auditError: err?.message || String(err)
          }));
        });

        return;
      }
```

**Wait — that's messy.** The cleaner approach uses `withAuditLog` to wrap the entire handler block. But `withAuditLog` wraps the `execute` function, and here the `execute` is the idempotent-write. Let me restructure.

The cleaner integration: capture `startedAt` at the top of the route, call `sendJson`, then fire the audit write after. Since we want to keep it DRY, use a helper pattern.

**Revised Step 3: Add timing + audit after sendJson for PUT**

In the PUT handler, add `const startedAt = Date.now();` at the top, and the fire-and-forget audit block after `sendJson`:

At `app.js` line 331, the PUT block becomes:

```js
      if (req.method === 'PUT' && path.startsWith('/api/shifts/')) {
        const startedAt = Date.now();
        const encodedId = path.replace('/api/shifts/', '');
        const occurrenceId = decodeURIComponent(encodedId);
        const body = (await readRequestBodySafely(req, requestId)) || {};
        const idempotencyKey = normalizeIdempotencyKey(req.headers['idempotency-key']);
        const result = await executeIdempotentWrite({
          idempotencyStorePromise,
          idempotencyKey,
          method: req.method,
          path,
          body,
          requestId,
          execute: async () => {
            try {
              const payload = await updateSingleOccurrence({
                occurrenceId,
                payload: body,
                slingClient,
                env,
                requestId
              });
              return { statusCode: 200, payload };
            } catch (error) {
              if (error instanceof ApiError) {
                return {
                  statusCode: error.statusCode || 400,
                  payload: normalizeSingleUpdateError(occurrenceId, error, requestId)
                };
              }
              throw error;
            }
          }
        });
        sendJson(res, result.statusCode, result.payload, baseHeaders);
        fireAuditLog(auditStorePromise, {
          requestId, idempotencyKey, method: req.method, path, body,
          statusCode: result.statusCode, payload: result.payload, startedAt
        });
        return;
      }
```

**Step 4: Same pattern for POST handler**

The POST handler (lines 368-398) becomes:

```js
      if (req.method === 'POST' && path === '/api/shifts/bulk') {
        const startedAt = Date.now();
        const body = (await readRequestBodySafely(req, requestId)) || {};
        const idempotencyKey = normalizeIdempotencyKey(req.headers['idempotency-key']);
        const result = await executeIdempotentWrite({
          idempotencyStorePromise,
          idempotencyKey,
          method: req.method,
          path,
          body,
          requestId,
          execute: async () => {
            try {
              const payload = await updateBulkOccurrences({
                payload: body,
                slingClient,
                env,
                requestId
              });
              const statusCode = payload.summary === 'failed' && payload.mode === 'flat' ? 409 : 200;
              return { statusCode, payload };
            } catch (error) {
              if (error instanceof ApiError) {
                return toErrorPayload(requestId, error);
              }
              throw error;
            }
          }
        });
        sendJson(res, result.statusCode, result.payload, baseHeaders);
        fireAuditLog(auditStorePromise, {
          requestId, idempotencyKey, method: req.method, path, body,
          statusCode: result.statusCode, payload: result.payload, startedAt
        });
        return;
      }
```

**Step 5: Add `fireAuditLog` helper in `app.js`**

Add this helper function inside `app.js` (after the existing helper functions, around line 109):

```js
function fireAuditLog(auditStorePromise, { requestId, idempotencyKey, method, path, body, statusCode, payload, startedAt }) {
  const durationMs = Date.now() - startedAt;
  auditStorePromise.then((store) =>
    store.record({
      requestId,
      idempotencyKey: idempotencyKey || null,
      method,
      path,
      body,
      statusCode,
      payload,
      durationMs,
      outcome: deriveOutcome(statusCode, payload)
    })
  ).catch((err) => {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'audit_write_failed',
        requestId,
        idempotencyKey: idempotencyKey || null,
        method,
        path,
        body,
        statusCode,
        payload,
        durationMs,
        outcome: deriveOutcome(statusCode, payload),
        auditError: err?.message || String(err)
      })
    );
  });
}
```

Update the import at line 1 to include `deriveOutcome`:

```js
import { createAuditStore, deriveOutcome } from './middleware/audit.js';
```

(Remove `withAuditLog` from the import — we're using `fireAuditLog` as a local helper instead since it's simpler for the fire-and-forget pattern.)

**Step 6: Run all tests**

Run: `cd /workspaces/clownsTesting/services/api && node --test`
Expected: All tests PASS (existing 28 + new audit tests)

---

### Task 6: Integration test — audit fires on PUT route

**Files:**
- Modify: `services/api/test/audit.test.js`

**Step 1: Write integration test**

Append to `services/api/test/audit.test.js`:

```js
import { Readable } from 'node:stream';
import { createRequestHandler } from '../src/app.js';

function buildEnv(overrides = {}) {
  return {
    nodeEnv: 'test',
    serviceName: 'sling-scheduling',
    timezone: 'America/New_York',
    corsAllowedOrigins: [],
    auditCollection: 'audit_log',
    ...overrides
  };
}

async function runHandler(handler, { method, url, headers = {}, body = null }) {
  const bodyText = body === null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const req = Readable.from(bodyText ? [Buffer.from(bodyText)] : []);
  req.method = method;
  req.url = url;
  req.headers = headers;

  let statusCode = 200;
  let responseHeaders = {};
  let responseBody = '';

  const res = {
    writeHead(code, outgoingHeaders = {}) {
      statusCode = code;
      responseHeaders = outgoingHeaders;
      return this;
    },
    end(payload = '') {
      responseBody = payload;
    }
  };

  await handler(req, res);

  let json = null;
  if (responseBody) {
    try { json = JSON.parse(responseBody); } catch { json = null; }
  }

  return { statusCode, headers: responseHeaders, body: responseBody, json };
}

test('PUT /api/shifts/:id records audit entry', async () => {
  const auditStore = await createAuditStore({ auditBackend: 'memory' });
  const defaultShift = {
    id: '4709706576:2026-02-07',
    type: 'shift',
    status: 'published',
    dtstart: '2026-02-07T09:15:00-05:00',
    dtend: '2026-02-07T17:00:00-05:00',
    user: { id: 7878740 },
    location: { id: 151378 },
    position: { id: 151397 }
  };

  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient: {
      async getShiftById() { return { ...defaultShift }; },
      async updateShift(_id, payload) { return payload; }
    },
    caspioClient: { async getTeamAssignmentsByDate() { return []; } },
    idempotencyStore: await (await import('../src/middleware/idempotency.js')).createIdempotencyStore({ idempotencyBackend: 'memory' }),
    auditStore
  });

  const res = await runHandler(handler, {
    method: 'PUT',
    url: '/api/shifts/4709706576%3A2026-02-07',
    headers: { 'content-type': 'application/json' },
    body: { startTime: '10:00', endTime: '17:00' }
  });

  assert.equal(res.statusCode, 200);

  // Allow fire-and-forget to settle
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(auditStore.entries.length, 1);
  assert.equal(auditStore.entries[0].method, 'PUT');
  assert.equal(auditStore.entries[0].outcome, 'success');
  assert.equal(auditStore.entries[0].statusCode, 200);
  assert.ok(auditStore.entries[0].durationMs >= 0);
  assert.deepEqual(auditStore.entries[0].body, { startTime: '10:00', endTime: '17:00' });
});
```

**Step 2: Run all tests**

Run: `cd /workspaces/clownsTesting/services/api && node --test`
Expected: All tests PASS

---

### Task 7: Run full validation suite

**Step 1: Run API tests**

Run: `cd /workspaces/clownsTesting/services/api && node --test`
Expected: All tests PASS (28 existing + ~10 new audit tests)

**Step 2: Run UI lint and build** (unchanged files, sanity check)

Run: `cd /workspaces/clownsTesting/app/ui && npm run lint && npm run build`
Expected: Clean lint, successful build

---

### Task 8: Update docs

**Files:**
- Modify: `docs/operations/CHANGELOG.md`
- Modify: `docs/operations/INCIDENT_REPORT.md`

**Step 1: Add changelog entry**

Add to the `2026-02-13` entry in `docs/operations/CHANGELOG.md`, under Completed:

```md
  - **Rec #4 — Audit log:** Added append-only `audit_log` Firestore collection via `withAuditLog` middleware in `services/api/src/middleware/audit.js`. Records every PUT/POST write request with full request body, full response payload, timing, and outcome. Fire-and-forget write after response is sent. On Firestore failure, falls back to `console.error` structured JSON. Enables future "Recent Activity" frontend feature.
```

Under Deploy/Config, add:

```md
  - Optional new env var: `AUDIT_COLLECTION` (default: `audit_log`). Uses same Firestore database as idempotency (`sling-scheduler`).
```

**Step 2: Update incident report Fix section**

Add item 4 to the Fix list in `docs/operations/INCIDENT_REPORT.md`:

```md
4. **Added append-only audit log** (`services/api/src/middleware/audit.js`). New `audit_log` Firestore collection records every PUT/POST write request with full request and response payloads, independent of idempotency store. Documents use auto-generated IDs (never overwritten). Fire-and-forget after response is sent; falls back to `console.error` on Firestore failure.
```
