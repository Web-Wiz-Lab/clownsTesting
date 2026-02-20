import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiError } from '../src/middleware/errors.js';
import { updateBulkOccurrences, updateSingleOccurrence } from '../src/routes/updates.js';

test('updateSingleOccurrence rejects non-occurrence ids', async () => {
  const slingClient = {
    getShiftById: async () => ({}),
    updateShift: async () => ({})
  };

  await assert.rejects(
    () =>
      updateSingleOccurrence({
        occurrenceId: '',
        payload: { startTime: '11:30', endTime: '16:30', status: 'published' },
        slingClient,
        env: { timezone: 'America/New_York' },
        requestId: 'test-1'
      }),
    /occurrenceId is required/
  );
});

test('updateSingleOccurrence updates date-time on same occurrence date', async () => {
  const calls = [];

  const slingClient = {
    async getShiftById() {
      return {
        id: '4709706576:2026-02-07',
        dtstart: '2026-02-07T09:15:00-05:00',
        dtend: '2026-02-07T17:00:00-05:00',
        status: 'published',
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
    },
    async updateShift(occurrenceId, payload) {
      calls.push({ occurrenceId, payload });
      return payload;
    }
  };

  const result = await updateSingleOccurrence({
    occurrenceId: '4709706576:2026-02-07',
    payload: { startTime: '12:45', endTime: '17:00', status: 'published' },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-2'
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].occurrenceId, '4709706576:2026-02-07');
  assert.equal(calls[0].payload.dtstart, '2026-02-07T12:45:00-05:00');
  assert.equal(calls[0].payload.dtend, '2026-02-07T17:00:00-05:00');
  assert.equal(calls[0].payload.rrule.freq, 'WEEKLY');
  assert.equal(result.summary, 'ok');
});

test('updateSingleOccurrence accepts non-recurring plain shift id', async () => {
  const slingClient = {
    async getShiftById() {
      return {
        id: '4738748479',
        dtstart: '2026-08-10T11:30:00-04:00',
        dtend: '2026-08-10T16:30:00-04:00',
        status: 'published',
        user: { id: 21341367 },
        location: { id: 151378 },
        position: { id: 151377 }
      };
    },
    async updateShift(_id, payload) {
      return [payload];
    }
  };

  const result = await updateSingleOccurrence({
    occurrenceId: '4738748479',
    payload: { startTime: '13:00', endTime: '16:00', status: 'published' },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-3'
  });

  assert.equal(result.summary, 'ok');
  assert.equal(result.data.occurrenceId, '4738748479');
  assert.equal(result.data.updatedShift.dtstart, '2026-08-10T13:00:00-04:00');
});

test('updateSingleOccurrence rejects recurring plain id without occurrence suffix', async () => {
  const slingClient = {
    async getShiftById() {
      return {
        id: '4709706576',
        dtstart: '2026-02-07T09:15:00-05:00',
        dtend: '2026-02-07T17:00:00-05:00',
        status: 'published',
        user: { id: 7878740 },
        location: { id: 151378 },
        position: { id: 151397 },
        rrule: { freq: 'WEEKLY' }
      };
    },
    async updateShift() {
      throw new Error('should not be called');
    }
  };

  await assert.rejects(
    () =>
      updateSingleOccurrence({
        occurrenceId: '4709706576',
        payload: { startTime: '13:00', endTime: '16:00', status: 'published' },
        slingClient,
        env: { timezone: 'America/New_York' },
        requestId: 'test-4'
      }),
    /Recurring shift update requires an occurrence ID/
  );
});

test('updateBulkOccurrences atomic group rolls back team when second update fails', async () => {
  const originalA = {
    id: 'A',
    dtstart: '2026-08-10T09:15:00-04:00',
    dtend: '2026-08-10T17:00:00-04:00',
    status: 'published',
    user: { id: 1001 },
    location: { id: 151378 },
    position: { id: 151397 }
  };
  const originalB = {
    id: 'B:2026-08-10',
    dtstart: '2026-08-10T09:15:00-04:00',
    dtend: '2026-08-10T17:00:00-04:00',
    status: 'published',
    user: { id: 1002 },
    location: { id: 151378 },
    position: { id: 151397 },
    rrule: { freq: 'WEEKLY' }
  };

  const state = {
    A: { ...originalA },
    'B:2026-08-10': { ...originalB }
  };

  const slingClient = {
    async getShiftById(occurrenceId) {
      return { ...state[occurrenceId] };
    },
    async updateShift(occurrenceId, payload) {
      if (occurrenceId === 'B:2026-08-10' && payload.dtstart.includes('13:00')) {
        throw new ApiError('Simulated conflict', {
          statusCode: 409,
          code: 'SLING_REQUEST_FAILED',
          details: { payload: { conflicts: [{ id: 'leave-1', type: 'leave' }] } }
        });
      }
      state[occurrenceId] = { ...payload };
      return payload;
    }
  };

  const result = await updateBulkOccurrences({
    payload: {
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
    },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-atomic-1'
  });

  assert.equal(result.mode, 'grouped');
  assert.equal(result.summary, 'failed');
  assert.equal(result.counts.success, 0);
  assert.equal(result.counts.failed, 1);
  assert.equal(result.results[0].groupId, 'Team 1');
  assert.equal(result.results[0].rolledBack, true);
  assert.equal(state.A.dtstart, originalA.dtstart);
  assert.equal(state.A.dtend, originalA.dtend);
});

test('updateBulkOccurrences grouped atomic allows one team to fail and others succeed', async () => {
  const shifts = {
    A1: {
      id: 'A1',
      dtstart: '2026-08-10T09:00:00-04:00',
      dtend: '2026-08-10T17:00:00-04:00',
      status: 'published',
      user: { id: 1 },
      location: { id: 151378 },
      position: { id: 151397 }
    },
    A2: {
      id: 'A2',
      dtstart: '2026-08-10T09:00:00-04:00',
      dtend: '2026-08-10T17:00:00-04:00',
      status: 'published',
      user: { id: 2 },
      location: { id: 151378 },
      position: { id: 151397 }
    },
    B1: {
      id: 'B1',
      dtstart: '2026-08-10T09:00:00-04:00',
      dtend: '2026-08-10T17:00:00-04:00',
      status: 'published',
      user: { id: 3 },
      location: { id: 151378 },
      position: { id: 151397 }
    },
    'B2:2026-08-10': {
      id: 'B2:2026-08-10',
      dtstart: '2026-08-10T09:00:00-04:00',
      dtend: '2026-08-10T17:00:00-04:00',
      status: 'published',
      user: { id: 4 },
      location: { id: 151378 },
      position: { id: 151397 },
      rrule: { freq: 'WEEKLY' }
    }
  };

  const slingClient = {
    async getShiftById(occurrenceId) {
      return { ...shifts[occurrenceId] };
    },
    async updateShift(occurrenceId, payload) {
      if (occurrenceId === 'B2:2026-08-10' && payload.dtstart.includes('14:00')) {
        throw new ApiError('Blocked by leave', { statusCode: 409, code: 'SLING_REQUEST_FAILED' });
      }
      shifts[occurrenceId] = { ...payload };
      return payload;
    }
  };

  const result = await updateBulkOccurrences({
    payload: {
      groups: [
        {
          groupId: 'Team A',
          atomic: true,
          updates: [
            { occurrenceId: 'A1', startTime: '12:00', endTime: '16:00', status: 'published' },
            { occurrenceId: 'A2', startTime: '12:00', endTime: '16:00', status: 'published' }
          ]
        },
        {
          groupId: 'Team B',
          atomic: true,
          updates: [
            { occurrenceId: 'B1', startTime: '14:00', endTime: '18:00', status: 'published' },
            { occurrenceId: 'B2:2026-08-10', startTime: '14:00', endTime: '18:00', status: 'published' }
          ]
        }
      ]
    },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-atomic-2'
  });

  assert.equal(result.mode, 'grouped');
  assert.equal(result.summary, 'partial_success');
  assert.equal(result.counts.total, 2);
  assert.equal(result.counts.success, 1);
  assert.equal(result.counts.failed, 1);
  assert.equal(result.results[0].status, 'success');
  assert.equal(result.results[1].status, 'failed');
});

// ─── Layer 2: Retry Tests ───────────────────────────────────────────────────

test('Layer 2: retry succeeds on second attempt after 417', async () => {
  const callCounts = {};

  const slingClient = {
    async getShiftById(occurrenceId) {
      return {
        id: occurrenceId,
        dtstart: '2026-02-21T09:00:00-05:00',
        dtend: '2026-02-21T17:00:00-05:00',
        status: 'published',
        user: { id: 1001 },
        location: { id: 151378 },
        position: { id: 151397 }
      };
    },
    async updateShift(occurrenceId, payload) {
      callCounts[occurrenceId] = (callCounts[occurrenceId] || 0) + 1;
      if (occurrenceId === 'S1' && callCounts[occurrenceId] <= 1) {
        throw new ApiError('Expectation Failed', {
          statusCode: 417,
          code: 'SLING_REQUEST_FAILED'
        });
      }
      return payload;
    }
  };

  const result = await updateBulkOccurrences({
    payload: {
      groups: [
        {
          groupId: 'Team Retry',
          atomic: true,
          updates: [
            { occurrenceId: 'S1', startTime: '12:00', endTime: '16:00', status: 'published' }
          ]
        }
      ]
    },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-retry-1'
  });

  assert.equal(result.summary, 'ok');
  assert.equal(result.counts.success, 1);
  assert.equal(result.results[0].status, 'success');
});

test('Layer 2: retry also fails, original failure preserved', async () => {
  const slingClient = {
    async getShiftById(occurrenceId) {
      return {
        id: occurrenceId,
        dtstart: '2026-02-21T09:00:00-05:00',
        dtend: '2026-02-21T17:00:00-05:00',
        status: 'published',
        user: { id: 1001 },
        location: { id: 151378 },
        position: { id: 151397 }
      };
    },
    async updateShift() {
      throw new ApiError('Expectation Failed', {
        statusCode: 417,
        code: 'SLING_REQUEST_FAILED'
      });
    },
    async getCalendarShifts() {
      return [];
    }
  };

  const result = await updateBulkOccurrences({
    payload: {
      groups: [
        {
          groupId: 'Team AlwaysFail',
          atomic: true,
          updates: [
            { occurrenceId: 'F1:2026-02-21', startTime: '12:00', endTime: '16:00', status: 'published' }
          ]
        }
      ]
    },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-retry-2'
  });

  assert.equal(result.summary, 'failed');
  assert.equal(result.counts.failed, 1);
  assert.equal(result.results[0].status, 'failed');
  assert.equal(result.results[0].groupId, 'Team AlwaysFail');
});

test('Layer 2: retries in original failure order', async () => {
  const retryOrder = [];
  const callCounts = {};

  const shifts = {
    'G1:2026-02-21': {
      id: 'G1:2026-02-21',
      dtstart: '2026-02-21T09:00:00-05:00',
      dtend: '2026-02-21T17:00:00-05:00',
      status: 'published',
      user: { id: 1 },
      location: { id: 151378 },
      position: { id: 151397 }
    },
    G2: {
      id: 'G2',
      dtstart: '2026-02-21T09:00:00-05:00',
      dtend: '2026-02-21T17:00:00-05:00',
      status: 'published',
      user: { id: 2 },
      location: { id: 151378 },
      position: { id: 151397 }
    },
    'G3:2026-02-21': {
      id: 'G3:2026-02-21',
      dtstart: '2026-02-21T09:00:00-05:00',
      dtend: '2026-02-21T17:00:00-05:00',
      status: 'published',
      user: { id: 3 },
      location: { id: 151378 },
      position: { id: 151397 }
    }
  };

  const slingClient = {
    async getShiftById(occurrenceId) {
      return { ...shifts[occurrenceId] };
    },
    async updateShift(occurrenceId, payload) {
      callCounts[occurrenceId] = (callCounts[occurrenceId] || 0) + 1;
      // G1 and G3 fail first time, succeed on retry
      if ((occurrenceId === 'G1:2026-02-21' || occurrenceId === 'G3:2026-02-21') && callCounts[occurrenceId] <= 1) {
        throw new ApiError('Expectation Failed', { statusCode: 417, code: 'SLING_REQUEST_FAILED' });
      }
      if (callCounts[occurrenceId] > 1) {
        retryOrder.push(occurrenceId);
      }
      return payload;
    }
  };

  const result = await updateBulkOccurrences({
    payload: {
      groups: [
        { groupId: 'Team 1', atomic: true, updates: [{ occurrenceId: 'G1:2026-02-21', startTime: '12:00', endTime: '16:00', status: 'published' }] },
        { groupId: 'Team 2', atomic: true, updates: [{ occurrenceId: 'G2', startTime: '12:00', endTime: '16:00', status: 'published' }] },
        { groupId: 'Team 3', atomic: true, updates: [{ occurrenceId: 'G3:2026-02-21', startTime: '12:00', endTime: '16:00', status: 'published' }] }
      ]
    },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-retry-order'
  });

  assert.equal(result.summary, 'ok');
  assert.equal(result.counts.success, 3);
  // Retried in order: Team 1 (index 0) before Team 3 (index 2)
  assert.equal(retryOrder[0], 'G1:2026-02-21');
  assert.equal(retryOrder[1], 'G3:2026-02-21');
});

// ─── Layer 3: Calendar Fallback Tests ───────────────────────────────────────

test('Layer 3: calendar fallback succeeds when occurrence PUT fails', async () => {
  const calendarShifts = [
    {
      id: '4709706601:2026-02-21',
      dtstart: '2026-02-21T09:00:00-05:00',
      dtend: '2026-02-21T17:00:00-05:00',
      status: 'published',
      user: { id: 5001 },
      location: { id: 151378 },
      position: { id: 151397 }
    }
  ];

  const slingClient = {
    async getShiftById(occurrenceId) {
      return {
        id: occurrenceId,
        dtstart: '2026-02-21T09:00:00-05:00',
        dtend: '2026-02-21T17:00:00-05:00',
        status: 'published',
        user: { id: 5001 },
        location: { id: 151378 },
        position: { id: 151397 }
      };
    },
    async updateShift(shiftId, payload) {
      // Occurrence ID PUTs always fail (Layers 1 & 2)
      if (String(shiftId).includes(':')) {
        throw new ApiError('Expectation Failed', { statusCode: 417, code: 'SLING_REQUEST_FAILED' });
      }
      // Event ID PUT succeeds (Layer 3)
      return payload;
    },
    async getCalendarShifts() {
      return calendarShifts;
    }
  };

  const result = await updateBulkOccurrences({
    payload: {
      groups: [
        {
          groupId: 'Team Calendar',
          atomic: true,
          updates: [
            { occurrenceId: '4709706601:2026-02-21', startTime: '12:00', endTime: '16:00', status: 'published' }
          ]
        }
      ]
    },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-fallback-1'
  });

  assert.equal(result.summary, 'ok');
  assert.equal(result.counts.success, 1);
  assert.equal(result.results[0].status, 'success');
});

test('Layer 3: partial failure triggers rollback of calendar fallback', async () => {
  const rollbackCalls = [];

  const calendarShifts = [
    {
      id: '100:2026-02-21',
      dtstart: '2026-02-21T09:00:00-05:00',
      dtend: '2026-02-21T17:00:00-05:00',
      status: 'published',
      user: { id: 6001 },
      location: { id: 151378 },
      position: { id: 151397 }
    },
    {
      id: '200:2026-02-21',
      dtstart: '2026-02-21T09:00:00-05:00',
      dtend: '2026-02-21T17:00:00-05:00',
      status: 'published',
      user: { id: 6002 },
      location: { id: 151378 },
      position: { id: 151397 }
    }
  ];

  const slingClient = {
    async getShiftById(occurrenceId) {
      const userId = occurrenceId.startsWith('100') ? 6001 : 6002;
      return {
        id: occurrenceId,
        dtstart: '2026-02-21T09:00:00-05:00',
        dtend: '2026-02-21T17:00:00-05:00',
        status: 'published',
        user: { id: userId },
        location: { id: 151378 },
        position: { id: 151397 }
      };
    },
    async updateShift(shiftId, payload) {
      // Occurrence IDs always fail (Layers 1 & 2)
      if (String(shiftId).includes(':')) {
        throw new ApiError('Expectation Failed', { statusCode: 417, code: 'SLING_REQUEST_FAILED' });
      }
      // Event ID: first succeeds, second fails
      if (shiftId === '200') {
        throw new ApiError('Still locked', { statusCode: 417, code: 'SLING_REQUEST_FAILED' });
      }
      // Track rollback calls (eventId '100' being rolled back)
      if (shiftId === '100' && payload.dtstart === '2026-02-21T09:00:00-05:00') {
        rollbackCalls.push(shiftId);
      }
      return payload;
    },
    async getCalendarShifts() {
      return calendarShifts;
    }
  };

  const result = await updateBulkOccurrences({
    payload: {
      groups: [
        {
          groupId: 'Team Partial',
          atomic: true,
          updates: [
            { occurrenceId: '100:2026-02-21', startTime: '12:00', endTime: '16:00', status: 'published' },
            { occurrenceId: '200:2026-02-21', startTime: '12:00', endTime: '16:00', status: 'published' }
          ]
        }
      ]
    },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-fallback-rollback'
  });

  // Fallback failed, so original failure is preserved
  assert.equal(result.summary, 'failed');
  assert.equal(result.counts.failed, 1);
  assert.equal(result.results[0].status, 'failed');
  // Rollback was attempted for the first successful event
  assert.equal(rollbackCalls.length, 1);
  assert.equal(rollbackCalls[0], '100');
});

test('Layer 3: rollback failure is surfaced when fallback rollback cannot complete', async () => {
  const callCounts = {};

  const calendarShifts = [
    {
      id: '100:2026-02-21',
      dtstart: '2026-02-21T09:00:00-05:00',
      dtend: '2026-02-21T17:00:00-05:00',
      status: 'published',
      user: { id: 7001 },
      location: { id: 151378 },
      position: { id: 151397 }
    },
    {
      id: '200:2026-02-21',
      dtstart: '2026-02-21T09:00:00-05:00',
      dtend: '2026-02-21T17:00:00-05:00',
      status: 'published',
      user: { id: 7002 },
      location: { id: 151378 },
      position: { id: 151397 }
    }
  ];

  const slingClient = {
    async getShiftById(occurrenceId) {
      const userId = occurrenceId.startsWith('100') ? 7001 : 7002;
      return {
        id: occurrenceId,
        dtstart: '2026-02-21T09:00:00-05:00',
        dtend: '2026-02-21T17:00:00-05:00',
        status: 'published',
        user: { id: userId },
        location: { id: 151378 },
        position: { id: 151397 }
      };
    },
    async updateShift(shiftId, payload) {
      callCounts[shiftId] = (callCounts[shiftId] || 0) + 1;

      // Occurrence IDs fail (Layers 1 & 2)
      if (String(shiftId).includes(':')) {
        throw new ApiError('Expectation Failed', { statusCode: 417, code: 'SLING_REQUEST_FAILED' });
      }
      // Fallback second event fails
      if (shiftId === '200') {
        throw new ApiError('Still locked', { statusCode: 417, code: 'SLING_REQUEST_FAILED' });
      }
      // Rollback of first fallback success also fails
      if (shiftId === '100' && payload.dtstart === '2026-02-21T09:00:00-05:00') {
        throw new ApiError('Rollback failed', { statusCode: 500, code: 'CALENDAR_ROLLBACK_FAILED' });
      }
      return payload;
    },
    async getCalendarShifts() {
      return calendarShifts;
    }
  };

  const result = await updateBulkOccurrences({
    payload: {
      groups: [
        {
          groupId: 'Team RollbackFail',
          atomic: true,
          updates: [
            { occurrenceId: '100:2026-02-21', startTime: '12:00', endTime: '16:00', status: 'published' },
            { occurrenceId: '200:2026-02-21', startTime: '12:00', endTime: '16:00', status: 'published' }
          ]
        }
      ]
    },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-fallback-rollback-failed'
  });

  assert.equal(result.summary, 'failed');
  assert.equal(result.results[0].status, 'failed');
  assert.equal(result.results[0].rolledBack, false);
  assert.equal(result.results[0].rollback.status, 'failed');
  assert.equal(result.results[0].rollback.failures.length, 1);
  assert.equal(result.results[0].rollback.failures[0].eventId, '100');
  assert.ok(callCounts['100'] >= 2, 'expected fallback apply + rollback attempts for eventId 100');
});

test('Layer 3: returns null when calendar has no matching user', async () => {
  const slingClient = {
    async getShiftById(occurrenceId) {
      return {
        id: occurrenceId,
        dtstart: '2026-02-21T09:00:00-05:00',
        dtend: '2026-02-21T17:00:00-05:00',
        status: 'published',
        user: { id: 9999 },
        location: { id: 151378 },
        position: { id: 151397 }
      };
    },
    async updateShift() {
      throw new ApiError('Expectation Failed', { statusCode: 417, code: 'SLING_REQUEST_FAILED' });
    },
    async getCalendarShifts() {
      // Calendar returns shifts for different users - no match
      return [
        {
          id: '555:2026-02-21',
          dtstart: '2026-02-21T09:00:00-05:00',
          dtend: '2026-02-21T17:00:00-05:00',
          status: 'published',
          user: { id: 1111 },
          location: { id: 151378 },
          position: { id: 151397 }
        }
      ];
    }
  };

  const result = await updateBulkOccurrences({
    payload: {
      groups: [
        {
          groupId: 'Team NoMatch',
          atomic: true,
          updates: [
            { occurrenceId: 'X1:2026-02-21', startTime: '12:00', endTime: '16:00', status: 'published' }
          ]
        }
      ]
    },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-fallback-nomatch'
  });

  // Original failure preserved since calendar fallback returned null
  assert.equal(result.summary, 'failed');
  assert.equal(result.counts.failed, 1);
  assert.equal(result.results[0].status, 'failed');
  assert.equal(result.results[0].groupId, 'Team NoMatch');
});

test('Layer 2/3: non-atomic failed groups are not retried or fallback-processed', async () => {
  const updateCalls = {};
  let calendarCalls = 0;

  const slingClient = {
    async getShiftById(occurrenceId) {
      return {
        id: occurrenceId,
        dtstart: '2026-02-21T09:00:00-05:00',
        dtend: '2026-02-21T17:00:00-05:00',
        status: 'published',
        user: { id: occurrenceId === 'A:2026-02-21' ? 8101 : 8102 },
        location: { id: 151378 },
        position: { id: 151397 }
      };
    },
    async updateShift(occurrenceId, payload) {
      updateCalls[occurrenceId] = (updateCalls[occurrenceId] || 0) + 1;
      if (occurrenceId === 'B:2026-02-21') {
        throw new ApiError('Expectation Failed', { statusCode: 417, code: 'SLING_REQUEST_FAILED' });
      }
      return payload;
    },
    async getCalendarShifts() {
      calendarCalls += 1;
      return [];
    }
  };

  const result = await updateBulkOccurrences({
    payload: {
      groups: [
        {
          groupId: 'Team NonAtomic',
          atomic: false,
          updates: [
            { occurrenceId: 'A:2026-02-21', startTime: '12:00', endTime: '16:00', status: 'published' },
            { occurrenceId: 'B:2026-02-21', startTime: '12:00', endTime: '16:00', status: 'published' }
          ]
        }
      ]
    },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-non-atomic-no-retry'
  });

  assert.equal(result.summary, 'failed');
  assert.equal(result.results[0].atomic, false);
  assert.equal(result.results[0].status, 'failed');
  assert.equal(result.results[0].counts.success, 1);
  assert.equal(result.results[0].counts.failed, 1);
  assert.equal(updateCalls['A:2026-02-21'], 1);
  assert.equal(updateCalls['B:2026-02-21'], 1);
  assert.equal(calendarCalls, 0);
});

test('Integration: all 3 layers - group fails initial + retry, succeeds on calendar fallback', async () => {
  let occurrenceCallCount = 0;

  const calendarShifts = [
    {
      id: '7777:2026-02-21',
      dtstart: '2026-02-21T09:00:00-05:00',
      dtend: '2026-02-21T17:00:00-05:00',
      status: 'published',
      user: { id: 8001 },
      location: { id: 151378 },
      position: { id: 151397 }
    }
  ];

  const slingClient = {
    async getShiftById(occurrenceId) {
      return {
        id: occurrenceId,
        dtstart: '2026-02-21T09:00:00-05:00',
        dtend: '2026-02-21T17:00:00-05:00',
        status: 'published',
        user: { id: 8001 },
        location: { id: 151378 },
        position: { id: 151397 }
      };
    },
    async updateShift(shiftId, payload) {
      if (String(shiftId).includes(':')) {
        occurrenceCallCount += 1;
        throw new ApiError('Expectation Failed', { statusCode: 417, code: 'SLING_REQUEST_FAILED' });
      }
      // Event ID succeeds (Layer 3)
      return payload;
    },
    async getCalendarShifts() {
      return calendarShifts;
    }
  };

  const result = await updateBulkOccurrences({
    payload: {
      groups: [
        {
          groupId: 'Team Integration',
          atomic: true,
          updates: [
            { occurrenceId: '7777:2026-02-21', startTime: '12:00', endTime: '16:00', status: 'published' }
          ]
        }
      ]
    },
    slingClient,
    env: { timezone: 'America/New_York' },
    requestId: 'test-integration'
  });

  assert.equal(result.summary, 'ok');
  assert.equal(result.counts.success, 1);
  assert.equal(result.results[0].status, 'success');
  // Occurrence PUT was tried twice (Layer 1 + Layer 2) before falling through to Layer 3
  assert.ok(occurrenceCallCount >= 2, `Expected at least 2 occurrence PUT attempts, got ${occurrenceCallCount}`);
});
