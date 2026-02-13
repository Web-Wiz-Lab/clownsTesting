import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveOutcome, createAuditStore, withAuditLog } from '../src/middleware/audit.js';

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
