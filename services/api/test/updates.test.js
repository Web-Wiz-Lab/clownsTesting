import test from 'node:test';
import assert from 'node:assert/strict';

import { updateSingleOccurrence } from '../src/routes/updates.js';

test('updateSingleOccurrence rejects non-occurrence ids', async () => {
  const slingClient = {
    getShiftById: async () => ({}),
    updateShift: async () => ({})
  };

  await assert.rejects(
    () =>
      updateSingleOccurrence({
        occurrenceId: '12345',
        payload: { startTime: '11:30', endTime: '16:30', status: 'published' },
        slingClient,
        env: { timezone: 'America/New_York' },
        requestId: 'test-1'
      }),
    /Occurrence ID/
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
