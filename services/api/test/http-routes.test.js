import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createRequestHandler } from '../src/app.js';

function buildEnv(overrides = {}) {
  return {
    nodeEnv: 'test',
    serviceName: 'sling-scheduling',
    timezone: 'America/New_York',
    corsAllowedOrigins: [],
    ...overrides
  };
}

function buildClients(overrides = {}) {
  const calls = {
    getShiftById: 0,
    getUsersByIds: 0,
    getTeamAssignmentsByDate: 0,
    updateShift: 0,
    errorReports: 0
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
        calls.getUsersByIds += 1;
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
        calls.getTeamAssignmentsByDate += 1;
        return [];
      },
      async getEntertainerSlingIds() {
        return [];
      },
      ...overrides.caspioClient
    },
    errorReporterClient: {
      async sendErrorReport() {
        calls.errorReports += 1;
        return {
          triggered: true,
          webhookStatus: 200
        };
      },
      ...overrides.errorReporterClient
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
  const { slingClient, caspioClient, errorReporterClient } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient,
    caspioClient,
    errorReporterClient
  });

  const result = await runHandler(handler, {
    method: 'GET',
    url: '/healthz'
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.json.summary, 'ok');
  assert.equal(result.json.service, 'sling-scheduling');
  assert.equal(result.json.timezone, 'America/New_York');
  assert.ok(result.json.requestId);
  assert.ok(result.headers['X-Request-Id']);
});

test('GET /readyz returns ok when Sling and Caspio checks pass', async () => {
  const { slingClient, caspioClient, errorReporterClient, calls } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient,
    caspioClient,
    errorReporterClient
  });

  const result = await runHandler(handler, {
    method: 'GET',
    url: '/readyz'
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.json.summary, 'ok');
  assert.equal(result.json.service, 'sling-scheduling');
  assert.equal(result.json.checks.sling.status, 'ok');
  assert.equal(result.json.checks.caspio.status, 'ok');
  assert.equal(result.json.cached, false);
  assert.equal(calls.getUsersByIds, 1);
  assert.equal(calls.getTeamAssignmentsByDate, 1);
});

test('GET /readyz returns degraded when a dependency check fails', async () => {
  const { slingClient, errorReporterClient, calls } = buildClients();
  const caspioClient = {
    async getTeamAssignmentsByDate() {
      calls.getTeamAssignmentsByDate += 1;
      const error = new Error('Caspio unavailable');
      error.code = 'CASPIO_REQUEST_FAILED';
      throw error;
    },
    async getEntertainerSlingIds() {
      return [];
    }
  };

  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient,
    caspioClient,
    errorReporterClient
  });

  const result = await runHandler(handler, {
    method: 'GET',
    url: '/readyz'
  });

  assert.equal(result.statusCode, 503);
  assert.equal(result.json.summary, 'degraded');
  assert.equal(result.json.checks.sling.status, 'ok');
  assert.equal(result.json.checks.caspio.status, 'degraded');
  assert.equal(result.json.checks.caspio.code, 'CASPIO_REQUEST_FAILED');
  assert.equal(result.json.cached, false);
  assert.equal(calls.getUsersByIds, 1);
  assert.equal(calls.getTeamAssignmentsByDate, 1);
});

test('GET /readyz uses cached dependency state within cache window', async () => {
  const { slingClient, caspioClient, errorReporterClient, calls } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv({ readinessCacheMs: 10_000 }),
    slingClient,
    caspioClient,
    errorReporterClient
  });

  const first = await runHandler(handler, {
    method: 'GET',
    url: '/readyz'
  });

  const second = await runHandler(handler, {
    method: 'GET',
    url: '/readyz'
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.json.cached, false);
  assert.equal(second.json.cached, true);
  assert.equal(calls.getUsersByIds, 1);
  assert.equal(calls.getTeamAssignmentsByDate, 1);
});

test('GET /readyz refresh=1 bypasses cache and reruns checks', async () => {
  const { slingClient, caspioClient, errorReporterClient, calls } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv({ readinessCacheMs: 10_000 }),
    slingClient,
    caspioClient,
    errorReporterClient
  });

  const first = await runHandler(handler, {
    method: 'GET',
    url: '/readyz'
  });

  const second = await runHandler(handler, {
    method: 'GET',
    url: '/readyz?refresh=1'
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.json.cached, false);
  assert.equal(second.json.cached, false);
  assert.equal(calls.getUsersByIds, 2);
  assert.equal(calls.getTeamAssignmentsByDate, 2);
});

test('POST /api/shifts/bulk respects idempotency key', async () => {
  const { slingClient, caspioClient, errorReporterClient, calls } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient,
    caspioClient,
    errorReporterClient
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

test('POST /api/shifts/bulk returns 409 when idempotency key is reused with different payload', async () => {
  const { slingClient, caspioClient, errorReporterClient, calls } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient,
    caspioClient,
    errorReporterClient
  });

  const key = `idem-${Date.now()}`;
  const firstPayload = {
    updates: [
      {
        occurrenceId: '4709706576:2026-02-07',
        startTime: '12:45',
        endTime: '17:00',
        status: 'published'
      }
    ]
  };
  const secondPayload = {
    updates: [
      {
        occurrenceId: '4709706576:2026-02-07',
        startTime: '13:00',
        endTime: '17:00',
        status: 'published'
      }
    ]
  };

  const first = await runHandler(handler, {
    method: 'POST',
    url: '/api/shifts/bulk',
    headers: { 'idempotency-key': key },
    body: firstPayload
  });

  const second = await runHandler(handler, {
    method: 'POST',
    url: '/api/shifts/bulk',
    headers: { 'idempotency-key': key },
    body: secondPayload
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 409);
  assert.equal(second.json.error.code, 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(calls.getShiftById, 1);
  assert.equal(calls.updateShift, 1);
});

test('PUT /api/shifts/:occurrenceId respects idempotency key', async () => {
  const { slingClient, caspioClient, errorReporterClient, calls } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient,
    caspioClient,
    errorReporterClient
  });

  const key = `idem-put-${Date.now()}`;
  const payload = {
    startTime: '11:30',
    endTime: '16:30',
    status: 'published'
  };

  const first = await runHandler(handler, {
    method: 'PUT',
    url: '/api/shifts/4709706576%3A2026-02-07',
    headers: { 'idempotency-key': key },
    body: payload
  });

  const second = await runHandler(handler, {
    method: 'PUT',
    url: '/api/shifts/4709706576%3A2026-02-07',
    headers: { 'idempotency-key': key },
    body: payload
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.json.summary, 'ok');
  assert.equal(second.json.summary, 'ok');
  assert.equal(calls.getShiftById, 1);
  assert.equal(calls.updateShift, 1);
});

test('PUT /api/shifts/:occurrenceId returns 409 when idempotency key is reused with different payload', async () => {
  const { slingClient, caspioClient, errorReporterClient, calls } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient,
    caspioClient,
    errorReporterClient
  });

  const key = `idem-put-${Date.now()}`;

  const first = await runHandler(handler, {
    method: 'PUT',
    url: '/api/shifts/4709706576%3A2026-02-07',
    headers: { 'idempotency-key': key },
    body: {
      startTime: '11:30',
      endTime: '16:30',
      status: 'published'
    }
  });

  const second = await runHandler(handler, {
    method: 'PUT',
    url: '/api/shifts/4709706576%3A2026-02-07',
    headers: { 'idempotency-key': key },
    body: {
      startTime: '12:00',
      endTime: '16:30',
      status: 'published'
    }
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 409);
  assert.equal(second.json.error.code, 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(calls.getShiftById, 1);
  assert.equal(calls.updateShift, 1);
});

test('idempotency in-progress reservation returns 409 without executing write route', async () => {
  const { slingClient, caspioClient, errorReporterClient, calls } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient,
    caspioClient,
    errorReporterClient,
    idempotencyStore: {
      async reserve() {
        return { status: 'in_progress' };
      },
      async complete() {
        throw new Error('complete should not be called');
      }
    }
  });

  const result = await runHandler(handler, {
    method: 'POST',
    url: '/api/shifts/bulk',
    headers: {
      'idempotency-key': 'idem-pending'
    },
    body: {
      updates: [
        {
          occurrenceId: '4709706576:2026-02-07',
          startTime: '12:45',
          endTime: '17:00',
          status: 'published'
        }
      ]
    }
  });

  assert.equal(result.statusCode, 409);
  assert.equal(result.json.error.code, 'IDEMPOTENCY_IN_PROGRESS');
  assert.equal(calls.getShiftById, 0);
  assert.equal(calls.updateShift, 0);
});

test('Disallowed origin is rejected in production mode', async () => {
  const { slingClient, caspioClient, errorReporterClient } = buildClients();
  const handler = createRequestHandler({
    env: buildEnv({
      nodeEnv: 'production',
      corsAllowedOrigins: ['https://allowed.example']
    }),
    slingClient,
    caspioClient,
    errorReporterClient
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

test('Grouped atomic failure returns 200 with failure summary for client-side reconciliation', async () => {
  const shifts = {
    A: {
      id: 'A',
      type: 'shift',
      status: 'published',
      dtstart: '2026-08-10T09:15:00-04:00',
      dtend: '2026-08-10T17:00:00-04:00',
      user: { id: 1 },
      location: { id: 151378 },
      position: { id: 151397 }
    },
    'B:2026-08-10': {
      id: 'B:2026-08-10',
      type: 'shift',
      status: 'published',
      dtstart: '2026-08-10T09:15:00-04:00',
      dtend: '2026-08-10T17:00:00-04:00',
      user: { id: 2 },
      location: { id: 151378 },
      position: { id: 151397 },
      rrule: { freq: 'WEEKLY' }
    }
  };

  const { caspioClient, errorReporterClient } = buildClients();
  const slingClient = {
    async getCalendarShifts() {
      return [];
    },
    async getUsersByIds() {
      return [];
    },
    async getShiftById(occurrenceId) {
      return { ...shifts[occurrenceId] };
    },
    async updateShift(occurrenceId, payload) {
      if (occurrenceId === 'B:2026-08-10' && payload.dtstart.includes('13:00')) {
        const error = new Error('Blocked');
        error.statusCode = 409;
        error.code = 'SLING_REQUEST_FAILED';
        throw error;
      }
      shifts[occurrenceId] = { ...payload };
      return payload;
    }
  };

  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient,
    caspioClient,
    errorReporterClient
  });

  const result = await runHandler(handler, {
    method: 'POST',
    url: '/api/shifts/bulk',
    body: {
      groups: [
        {
          groupId: 'Team 1',
          atomic: true,
          updates: [
            { occurrenceId: 'A', startTime: '13:00', endTime: '16:00', status: 'published' },
            { occurrenceId: 'B:2026-08-10', startTime: '13:00', endTime: '16:00', status: 'published' }
          ]
        }
      ]
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.json.mode, 'grouped');
  assert.equal(result.json.summary, 'failed');
  assert.equal(result.json.results[0].rolledBack, true);
});

test('POST /api/error-report forwards payload and returns trigger acknowledgment', async () => {
  const { slingClient, caspioClient, errorReporterClient, calls } = buildClients();
  const captured = [];
  errorReporterClient.sendErrorReport = async (payload) => {
    calls.errorReports += 1;
    captured.push(payload);
    return {
      triggered: true,
      webhookStatus: 200
    };
  };

  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient,
    caspioClient,
    errorReporterClient
  });

  const result = await runHandler(handler, {
    method: 'POST',
    url: '/api/error-report',
    body: {
      action: 'update_team',
      userMessage: 'Could not update this team.',
      error: { code: 'SLING_REQUEST_FAILED' },
      context: { teamName: 'Team 1' }
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.json.summary, 'ok');
  assert.equal(result.json.data.triggered, true);
  assert.equal(calls.errorReports, 1);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].source, 'sling-scheduler-ui');
  assert.equal(captured[0].server.service, 'sling-scheduling');
  assert.equal(captured[0].event.action, 'update_team');
});
