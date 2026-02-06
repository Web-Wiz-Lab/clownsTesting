import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createRequestHandler } from '../src/app.js';

function buildEnv(overrides = {}) {
  return {
    nodeEnv: 'test',
    timezone: 'America/New_York',
    corsAllowedOrigins: [],
    ...overrides
  };
}

function buildClients(overrides = {}) {
  const calls = {
    getShiftById: 0,
    updateShift: 0
  };

  const defaultShift = {
    id: '4709706576:2026-02-07',
    type: 'shift',
    status: 'published',
    dtstart: '2026-02-07T09:15:00-05:00',
    dtend: '2026-02-07T17:00:00-05:00',
    user: { id: 7878740 },
    location: { id: 151378 },
    position: { id: 151397 },
    rrule: {
      id: 4709706576,
      from: '2026-02-07T09:15:00-05:00',
      until: '2026-03-07T23:59:00-05:00',
      interval: 1,
      byday: 'SA',
      freq: 'WEEKLY'
    }
  };

  return {
    calls,
    slingClient: {
      async getCalendarShifts() {
        return [];
      },
      async getUsersByIds() {
        return [];
      },
      async getShiftById() {
        calls.getShiftById += 1;
        return { ...defaultShift };
      },
      async updateShift(_occurrenceId, payload) {
        calls.updateShift += 1;
        return payload;
      },
      ...overrides.slingClient
    },
    caspioClient: {
      async getTeamAssignmentsByDate() {
        return [];
      },
      async getEntertainerSlingIds() {
        return [];
      },
      ...overrides.caspioClient
    }
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
    try {
      json = JSON.parse(responseBody);
    } catch {
      json = null;
    }
  }

  return {
    statusCode,
    headers: responseHeaders,
    body: responseBody,
    json
  };
}

test('GET /healthz returns ok response with request id', async () => {
  const { slingClient, caspioClient } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient,
    caspioClient
  });

  const result = await runHandler(handler, {
    method: 'GET',
    url: '/healthz'
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.json.summary, 'ok');
  assert.equal(result.json.timezone, 'America/New_York');
  assert.ok(result.json.requestId);
  assert.ok(result.headers['X-Request-Id']);
});

test('POST /api/shifts/bulk respects idempotency key', async () => {
  const { slingClient, caspioClient, calls } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient,
    caspioClient
  });

  const payload = {
    updates: [
      {
        occurrenceId: '4709706576:2026-02-07',
        startTime: '12:45',
        endTime: '17:00',
        status: 'published'
      }
    ]
  };

  const key = `idem-${Date.now()}`;

  const first = await runHandler(handler, {
    method: 'POST',
    url: '/api/shifts/bulk',
    headers: {
      'idempotency-key': key
    },
    body: payload
  });

  const second = await runHandler(handler, {
    method: 'POST',
    url: '/api/shifts/bulk',
    headers: {
      'idempotency-key': key
    },
    body: payload
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.json.summary, 'ok');
  assert.equal(second.json.summary, 'ok');
  assert.equal(calls.getShiftById, 1);
  assert.equal(calls.updateShift, 1);
});

test('Disallowed origin is rejected in production mode', async () => {
  const { slingClient, caspioClient } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv({
      nodeEnv: 'production',
      corsAllowedOrigins: ['https://allowed.example']
    }),
    slingClient,
    caspioClient
  });

  const result = await runHandler(handler, {
    method: 'POST',
    url: '/api/shifts/bulk',
    headers: {
      origin: 'https://blocked.example'
    },
    body: { updates: [] }
  });

  assert.equal(result.statusCode, 403);
  assert.equal(result.json.error.code, 'ORIGIN_NOT_ALLOWED');
});
