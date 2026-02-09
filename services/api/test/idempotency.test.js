import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRequestFingerprint,
  buildScopedIdempotencyKey,
  createIdempotencyStore
} from '../src/middleware/idempotency.js';

test('buildRequestFingerprint is stable for equivalent object key order', () => {
  const first = buildRequestFingerprint({
    method: 'POST',
    path: '/api/shifts/bulk',
    body: {
      updates: [{ occurrenceId: 'A', startTime: '10:00', endTime: '11:00' }],
      meta: { timezone: 'America/New_York', source: 'ui' }
    }
  });

  const second = buildRequestFingerprint({
    method: 'POST',
    path: '/api/shifts/bulk',
    body: {
      meta: { source: 'ui', timezone: 'America/New_York' },
      updates: [{ endTime: '11:00', startTime: '10:00', occurrenceId: 'A' }]
    }
  });

  assert.equal(first, second);
});

test('memory idempotency store replays completed response', async () => {
  const store = await createIdempotencyStore({
    idempotencyBackend: 'memory',
    idempotencyPendingTtlSeconds: 120,
    idempotencyTtlSeconds: 600
  });

  const scopedKey = buildScopedIdempotencyKey({
    method: 'POST',
    path: '/api/shifts/bulk',
    idempotencyKey: 'idem-1'
  });
  const fingerprint = buildRequestFingerprint({
    method: 'POST',
    path: '/api/shifts/bulk',
    body: { updates: [{ occurrenceId: 'A', startTime: '10:00', endTime: '11:00' }] }
  });

  const reserve = await store.reserve({ scopedKey, fingerprint, requestId: 'req-1' });
  assert.equal(reserve.status, 'reserved');

  const complete = await store.complete({
    scopedKey,
    fingerprint,
    statusCode: 200,
    payload: { requestId: 'req-1', summary: 'ok' },
    requestId: 'req-1'
  });
  assert.equal(complete.status, 'completed');

  const replay = await store.reserve({ scopedKey, fingerprint, requestId: 'req-2' });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.payload.summary, 'ok');
});

test('memory idempotency store rejects reused key with different fingerprint', async () => {
  const store = await createIdempotencyStore({
    idempotencyBackend: 'memory',
    idempotencyPendingTtlSeconds: 120,
    idempotencyTtlSeconds: 600
  });

  const scopedKey = buildScopedIdempotencyKey({
    method: 'PUT',
    path: '/api/shifts/4709706576%3A2026-02-07',
    idempotencyKey: 'idem-2'
  });
  const originalFingerprint = buildRequestFingerprint({
    method: 'PUT',
    path: '/api/shifts/4709706576%3A2026-02-07',
    body: { startTime: '10:00', endTime: '11:00', status: 'published' }
  });
  const changedFingerprint = buildRequestFingerprint({
    method: 'PUT',
    path: '/api/shifts/4709706576%3A2026-02-07',
    body: { startTime: '10:30', endTime: '11:00', status: 'published' }
  });

  const reserve = await store.reserve({
    scopedKey,
    fingerprint: originalFingerprint,
    requestId: 'req-1'
  });
  assert.equal(reserve.status, 'reserved');

  const conflict = await store.reserve({
    scopedKey,
    fingerprint: changedFingerprint,
    requestId: 'req-2'
  });
  assert.equal(conflict.status, 'conflict');
});

test('memory idempotency store reports in_progress for active reservation', async () => {
  const store = await createIdempotencyStore({
    idempotencyBackend: 'memory',
    idempotencyPendingTtlSeconds: 120,
    idempotencyTtlSeconds: 600
  });

  const scopedKey = buildScopedIdempotencyKey({
    method: 'POST',
    path: '/api/shifts/bulk',
    idempotencyKey: 'idem-3'
  });
  const fingerprint = buildRequestFingerprint({
    method: 'POST',
    path: '/api/shifts/bulk',
    body: { updates: [{ occurrenceId: 'A', startTime: '10:00', endTime: '11:00' }] }
  });

  const reserve = await store.reserve({ scopedKey, fingerprint, requestId: 'req-1' });
  assert.equal(reserve.status, 'reserved');

  const pending = await store.reserve({ scopedKey, fingerprint, requestId: 'req-2' });
  assert.equal(pending.status, 'in_progress');
});
