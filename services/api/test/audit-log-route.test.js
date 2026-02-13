import test from 'node:test';
import assert from 'node:assert/strict';

import { mapAuditEntry, extractScheduleDate } from '../src/routes/audit-log.js';

// --- extractScheduleDate tests ---

test('extractScheduleDate returns date from nested payload.results[].results[].data.date', () => {
  const payload = {
    results: [
      {
        status: 'success',
        groupId: 'Team 25',
        results: [
          {
            status: 'success',
            occurrenceId: '4745402267',
            data: {
              date: '2026-08-03',
              dtstart: '2026-08-03T13:30:00-04:00',
              dtend: '2026-08-03T14:15:00-04:00'
            }
          },
          {
            status: 'success',
            occurrenceId: '4745403686',
            data: {
              date: '2026-08-03',
              dtstart: '2026-08-03T13:30:00-04:00',
              dtend: '2026-08-03T14:15:00-04:00'
            }
          }
        ]
      }
    ]
  };

  assert.equal(extractScheduleDate(payload), '2026-08-03');
});

test('extractScheduleDate returns null when payload has no results', () => {
  assert.equal(extractScheduleDate({}), null);
  assert.equal(extractScheduleDate(null), null);
  assert.equal(extractScheduleDate(undefined), null);
});

test('extractScheduleDate returns null when results exist but no data.date', () => {
  const payload = {
    results: [
      {
        status: 'success',
        results: [
          { status: 'success', occurrenceId: '123' }
        ]
      }
    ]
  };

  assert.equal(extractScheduleDate(payload), null);
});

// --- mapAuditEntry tests ---

// Fixture mirroring real Firestore document structure (two-level nesting)
function buildSingleTeamAuditRecord() {
  return {
    id: 'firestore-doc-1',
    requestId: '28779d6c-1c1b-4588-a9a0-4ced6237545f',
    method: 'POST',
    path: '/api/shifts/bulk',
    statusCode: 200,
    durationMs: 2162,
    outcome: 'success',
    timestamp: new Date('2026-02-13T18:22:47.568Z'),
    auditWriteStatus: 'ok',
    body: {
      groups: [
        {
          groupId: 'Team 25',
          atomic: true,
          updates: [
            { occurrenceId: '4745402267', startTime: '13:30', endTime: '14:15', status: 'published' },
            { occurrenceId: '4745403686', startTime: '13:30', endTime: '14:15', status: 'published' }
          ]
        }
      ]
    },
    payload: {
      requestId: '28779d6c-1c1b-4588-a9a0-4ced6237545f',
      mode: 'grouped',
      counts: { failed: 0, success: 1, total: 1 },
      results: [
        {
          status: 'success',
          groupId: 'Team 25',
          atomic: true,
          index: 0,
          counts: { failed: 0, success: 2, total: 2 },
          results: [
            {
              status: 'success',
              index: 0,
              occurrenceId: '4745402267',
              data: {
                id: '4745402267',
                date: '2026-08-03',
                dtstart: '2026-08-03T13:30:00-04:00',
                dtend: '2026-08-03T14:15:00-04:00',
                startTime: '13:30',
                endTime: '14:15',
                startLabel: '1:30 PM',
                endLabel: '2:15 PM',
                status: 'published',
                hasRecurrence: false,
                userId: 21341367,
                locationId: 151378,
                positionId: 151377
              }
            },
            {
              status: 'success',
              index: 1,
              occurrenceId: '4745403686',
              data: {
                id: '4745403686',
                date: '2026-08-03',
                dtstart: '2026-08-03T13:30:00-04:00',
                dtend: '2026-08-03T14:15:00-04:00',
                startTime: '13:30',
                endTime: '14:15',
                startLabel: '1:30 PM',
                endLabel: '2:15 PM',
                status: 'published',
                hasRecurrence: false,
                userId: 24861296,
                locationId: 151378,
                positionId: 151397
              }
            }
          ],
          rollback: { status: 'not_needed', rolledBack: false, failures: [] },
          summary: 'ok',
          timezone: 'America/New_York'
        }
      ]
    }
  };
}

test('mapAuditEntry: single team with date produces correct summary and type', () => {
  const raw = buildSingleTeamAuditRecord();
  const mapped = mapAuditEntry(raw);

  assert.equal(mapped.id, 'firestore-doc-1');
  assert.equal(mapped.type, 'single');
  assert.equal(mapped.outcome, 'success');
  assert.equal(mapped.scheduleDate, '2026-08-03');
  assert.equal(mapped.requestId, '28779d6c-1c1b-4588-a9a0-4ced6237545f');
  assert.ok(mapped.summary.includes('Team 25'));
  assert.ok(mapped.summary.includes('August 3, 2026'));
  assert.equal(mapped.groups.length, 1);
  assert.equal(mapped.groups[0].groupId, 'Team 25');
  assert.equal(mapped.groups[0].status, 'success');
});

test('mapAuditEntry: bulk (multiple teams) produces correct summary and type', () => {
  const raw = buildSingleTeamAuditRecord();
  // Add more groups to make it bulk
  raw.body.groups.push(
    { groupId: 'Team 10', atomic: true, updates: [] },
    { groupId: 'Team 15', atomic: true, updates: [] },
    { groupId: 'Team 20', atomic: true, updates: [] }
  );
  raw.payload.results.push(
    { status: 'success', groupId: 'Team 10', results: [{ data: { date: '2026-08-03' } }] },
    { status: 'failed', groupId: 'Team 15', results: [] },
    { status: 'success', groupId: 'Team 20', results: [{ data: { date: '2026-08-03' } }] }
  );

  const mapped = mapAuditEntry(raw);

  assert.equal(mapped.type, 'bulk');
  assert.ok(mapped.summary.includes('Bulk edit 4 teams'));
  assert.ok(mapped.summary.includes('August 3, 2026'));
  assert.equal(mapped.groups.length, 4);
  assert.equal(mapped.groups[0].groupId, 'Team 25');
  assert.equal(mapped.groups[0].status, 'success');
  assert.equal(mapped.groups[2].groupId, 'Team 15');
  assert.equal(mapped.groups[2].status, 'failed');
});

test('mapAuditEntry: missing date omits date from summary', () => {
  const raw = buildSingleTeamAuditRecord();
  // Remove data.date from all nested results
  for (const group of raw.payload.results) {
    for (const item of group.results) {
      delete item.data.date;
    }
  }

  const mapped = mapAuditEntry(raw);

  assert.equal(mapped.summary, 'Team 25 shifts updated');
  assert.equal(mapped.scheduleDate, null);
});

test('mapAuditEntry: timestamp Date object converted to ISO string', () => {
  const raw = buildSingleTeamAuditRecord();
  const mapped = mapAuditEntry(raw);

  assert.equal(mapped.timestamp, '2026-02-13T18:22:47.568Z');
});

test('mapAuditEntry: maps group details from body and payload results', () => {
  const raw = buildSingleTeamAuditRecord();
  const mapped = mapAuditEntry(raw);

  assert.equal(mapped.groups.length, 1);
  assert.equal(mapped.groups[0].groupId, 'Team 25');
  assert.equal(mapped.groups[0].status, 'success');
});

test('mapAuditEntry: no groups produces shift update summary', () => {
  const raw = buildSingleTeamAuditRecord();
  raw.body = {};

  const mapped = mapAuditEntry(raw);

  assert.equal(mapped.summary, 'Shift update');
  assert.equal(mapped.type, 'single');
  assert.equal(mapped.groups.length, 0);
});

// --- Integration tests ---

import { Readable } from 'node:stream';
import { createAuditStore } from '../src/middleware/audit.js';
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

test('GET /api/audit-log returns mapped entries from audit store', async () => {
  const auditStore = await createAuditStore({ auditBackend: 'memory' });

  // Record a single-team entry
  await auditStore.record({
    requestId: 'req-single',
    method: 'POST',
    path: '/api/shifts/bulk',
    statusCode: 200,
    durationMs: 100,
    outcome: 'success',
    body: {
      groups: [{ groupId: 'Team 5', atomic: true, updates: [] }]
    },
    payload: {
      results: [
        {
          status: 'success',
          groupId: 'Team 5',
          results: [{ status: 'success', data: { date: '2026-03-01' } }]
        }
      ]
    }
  });

  // Record a bulk entry
  await auditStore.record({
    requestId: 'req-bulk',
    method: 'POST',
    path: '/api/shifts/bulk',
    statusCode: 200,
    durationMs: 200,
    outcome: 'partial',
    body: {
      groups: [
        { groupId: 'Team 1', atomic: true, updates: [] },
        { groupId: 'Team 2', atomic: true, updates: [] }
      ]
    },
    payload: {
      results: [
        { status: 'success', groupId: 'Team 1', results: [{ data: { date: '2026-03-01' } }] },
        { status: 'failed', groupId: 'Team 2', results: [] }
      ]
    }
  });

  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient: { async getUsersByIds() { return []; } },
    caspioClient: { async getTeamAssignmentsByDate() { return []; } },
    auditStore
  });

  const res = await runHandler(handler, {
    method: 'GET',
    url: '/api/audit-log'
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json.entries.length, 2);

  // Newest first — bulk entry was recorded second
  const first = res.json.entries[0];
  assert.equal(first.type, 'bulk');
  assert.equal(first.outcome, 'partial');
  assert.ok(first.summary.includes('Bulk edit 2 teams'));
  assert.equal(first.groups.length, 2);
  assert.equal(first.groups[0].groupId, 'Team 1');
  assert.equal(first.groups[0].status, 'success');
  assert.equal(first.groups[1].groupId, 'Team 2');
  assert.equal(first.groups[1].status, 'failed');

  const second = res.json.entries[1];
  assert.equal(second.type, 'single');
  assert.equal(second.outcome, 'success');
  assert.ok(second.summary.includes('Team 5'));
});

test('GET /api/audit-log supports pagination with limit and cursor', async () => {
  const auditStore = await createAuditStore({ auditBackend: 'memory' });

  await auditStore.record({
    requestId: 'req-a', method: 'PUT', path: '/api/shifts/1', statusCode: 200,
    durationMs: 10, outcome: 'success',
    body: { groups: [{ groupId: 'Team A', updates: [] }] },
    payload: { results: [{ status: 'success', results: [{ data: { date: '2026-04-01' } }] }] }
  });
  await auditStore.record({
    requestId: 'req-b', method: 'PUT', path: '/api/shifts/2', statusCode: 200,
    durationMs: 20, outcome: 'success',
    body: { groups: [{ groupId: 'Team B', updates: [] }] },
    payload: { results: [{ status: 'success', results: [{ data: { date: '2026-04-02' } }] }] }
  });
  await auditStore.record({
    requestId: 'req-c', method: 'PUT', path: '/api/shifts/3', statusCode: 200,
    durationMs: 30, outcome: 'success',
    body: { groups: [{ groupId: 'Team C', updates: [] }] },
    payload: { results: [{ status: 'success', results: [{ data: { date: '2026-04-03' } }] }] }
  });

  const handler = createRequestHandler({
    env: buildEnv(),
    slingClient: { async getUsersByIds() { return []; } },
    caspioClient: { async getTeamAssignmentsByDate() { return []; } },
    auditStore
  });

  // Page 1: limit=1
  const page1 = await runHandler(handler, {
    method: 'GET',
    url: '/api/audit-log?limit=1'
  });

  assert.equal(page1.statusCode, 200);
  assert.equal(page1.json.entries.length, 1);
  assert.equal(page1.json.entries[0].requestId, 'req-c');
  assert.ok(page1.json.nextCursor);

  // Page 2: use cursor
  const page2 = await runHandler(handler, {
    method: 'GET',
    url: `/api/audit-log?limit=1&cursor=${page1.json.nextCursor}`
  });

  assert.equal(page2.statusCode, 200);
  assert.equal(page2.json.entries.length, 1);
  assert.equal(page2.json.entries[0].requestId, 'req-b');
  assert.ok(page2.json.nextCursor);

  // Page 3: last entry
  const page3 = await runHandler(handler, {
    method: 'GET',
    url: `/api/audit-log?limit=1&cursor=${page2.json.nextCursor}`
  });

  assert.equal(page3.statusCode, 200);
  assert.equal(page3.json.entries.length, 1);
  assert.equal(page3.json.entries[0].requestId, 'req-a');
  assert.equal(page3.json.nextCursor, null);
});
