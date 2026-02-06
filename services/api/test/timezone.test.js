import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertTimeRange,
  buildDateTime,
  formatDateForCaspio,
  isValidIsoDate,
  isValidTime24
} from '../src/domain/timezone.js';

test('isValidIsoDate validates YYYY-MM-DD', () => {
  assert.equal(isValidIsoDate('2026-02-07'), true);
  assert.equal(isValidIsoDate('2026-2-7'), false);
  assert.equal(isValidIsoDate('2026-02-31'), false);
});

test('time validation and range checks', () => {
  assert.equal(isValidTime24('11:30'), true);
  assert.equal(isValidTime24('24:00'), false);
  assert.equal(assertTimeRange('11:30', '16:30'), true);
  assert.equal(assertTimeRange('16:30', '11:30'), false);
});

test('date formatting and datetime building', () => {
  assert.equal(formatDateForCaspio('2026-02-07'), '02/07/2026');
  assert.equal(buildDateTime('2026-02-07', '11:30', '-05:00'), '2026-02-07T11:30:00-05:00');
});
