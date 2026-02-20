import { ApiError } from '../middleware/errors.js';
import {
  assertTimeRange,
  buildDateTime,
  extractDateFromIsoDateTime,
  isValidTime24,
  resolveOffset
} from '../domain/timezone.js';
import {
  buildBulkSummary,
  normalizeShiftForUi,
  normalizeSlingConflict
} from '../domain/normalizers.js';

const ALLOWED_STATUS = new Set(['published', 'planning']);

function validateOccurrenceId(occurrenceId) {
  if (!occurrenceId || typeof occurrenceId !== 'string') {
    throw new ApiError('occurrenceId is required', {
      statusCode: 400,
      code: 'INVALID_OCCURRENCE_ID'
    });
  }

  if (!occurrenceId.includes(':')) {
    return;
  }

  const parts = occurrenceId.split(':');
  if (parts.length !== 2 || !/^\d{4}-\d{2}-\d{2}$/.test(parts[1])) {
    throw new ApiError('Occurrence ID format is invalid (expected seriesId:YYYY-MM-DD)', {
      statusCode: 400,
      code: 'INVALID_OCCURRENCE_ID'
    });
  }
}

function validateUpdateInput(payload) {
  const hasTime = payload?.startTime || payload?.endTime;

  if (hasTime) {
    if (!payload?.startTime || !payload?.endTime) {
      throw new ApiError('Both startTime and endTime are required when updating time', {
        statusCode: 400,
        code: 'INVALID_TIME_UPDATE'
      });
    }

    if (!isValidTime24(payload.startTime) || !isValidTime24(payload.endTime)) {
      throw new ApiError('Time must be in HH:mm 24-hour format', {
        statusCode: 400,
        code: 'INVALID_TIME_FORMAT'
      });
    }

    if (!assertTimeRange(payload.startTime, payload.endTime)) {
      throw new ApiError('endTime must be after startTime', {
        statusCode: 400,
        code: 'INVALID_TIME_RANGE'
      });
    }
  }

  if (payload?.status && !ALLOWED_STATUS.has(payload.status)) {
    throw new ApiError('status must be one of: published, planning', {
      statusCode: 400,
      code: 'INVALID_STATUS'
    });
  }

  if (!hasTime && !payload?.status) {
    throw new ApiError('No changes provided. Send startTime/endTime and/or status.', {
      statusCode: 400,
      code: 'EMPTY_UPDATE'
    });
  }
}

function unwrapSlingShiftResponse(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    return payload[0] || null;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data[0] || null;
  }
  return payload;
}

function toFailure(occurrenceId, error, index = null) {
  const conflicts = normalizeSlingConflict(error?.details?.payload || {});
  return {
    index,
    occurrenceId,
    status: 'failed',
    error: {
      code: error.code || 'UPDATE_FAILED',
      message: error.message,
      details: error.details || null,
      conflicts
    }
  };
}

function assertOccurrenceCompatibility(occurrenceId, current) {
  if (!occurrenceId.includes(':') && current?.rrule) {
    throw new ApiError(
      'Recurring shift update requires an occurrence ID with date suffix (seriesId:YYYY-MM-DD)',
      {
        statusCode: 400,
        code: 'RECURRING_REQUIRES_OCCURRENCE_ID'
      }
    );
  }
}

function buildOutboundShift(current, occurrenceId, payload) {
  const date = extractDateFromIsoDateTime(current?.dtstart);
  if (!date) {
    throw new ApiError('Shift start datetime is invalid', {
      statusCode: 422,
      code: 'INVALID_SHIFT_DATETIME',
      details: { occurrenceId, dtstart: current?.dtstart }
    });
  }

  const offset = resolveOffset(current);
  const outbound = { ...current, id: occurrenceId, openEnd: true };

  if (payload.startTime && payload.endTime) {
    outbound.dtstart = buildDateTime(date, payload.startTime, offset);
    outbound.dtend = buildDateTime(date, payload.endTime, offset);
  }

  if (payload.status) {
    outbound.status = payload.status;
  }

  return outbound;
}

function extractDateFromOccurrenceId(occurrenceId) {
  if (!occurrenceId || !occurrenceId.includes(':')) return null;
  const parts = occurrenceId.split(':');
  return parts[1] || null;
}

function extractEventId(calendarShiftId) {
  if (!calendarShiftId || !String(calendarShiftId).includes(':')) return String(calendarShiftId);
  return String(calendarShiftId).split(':')[0];
}

async function performSingleUpdate({ occurrenceId, payload, slingClient, env, requestId, currentShift = null }) {
  validateOccurrenceId(occurrenceId);
  validateUpdateInput(payload);

  const current = currentShift || (await slingClient.getShiftById(occurrenceId, requestId));
  assertOccurrenceCompatibility(occurrenceId, current);

  const outbound = buildOutboundShift(current, occurrenceId, payload);
  const updatedRaw = await slingClient.updateShift(occurrenceId, outbound, requestId);
  const updated = unwrapSlingShiftResponse(updatedRaw) || outbound;
  const normalizedShift = { ...outbound, ...updated };

  return {
    occurrenceId: normalizedShift.id || occurrenceId,
    updatedShift: normalizeShiftForUi(normalizedShift, env.timezone)
  };
}

function toSuccess(index, result) {
  return {
    index,
    occurrenceId: result.occurrenceId,
    status: 'success',
    data: result.updatedShift
  };
}

const CONCURRENCY = 1;

async function processFlatUpdates({ updates, slingClient, env, requestId }) {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new ApiError('updates must be a non-empty array', {
      statusCode: 400,
      code: 'INVALID_BULK_PAYLOAD'
    });
  }

  const results = new Array(updates.length);

  for (let start = 0; start < updates.length; start += CONCURRENCY) {
    const batch = updates.slice(start, start + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (item, batchIndex) => {
        const index = start + batchIndex;
        const occurrenceId = item?.occurrenceId;
        try {
          const single = await performSingleUpdate({
            occurrenceId,
            payload: item,
            slingClient,
            env,
            requestId
          });
          return toSuccess(index, single);
        } catch (error) {
          return toFailure(occurrenceId, error, index);
        }
      })
    );
    batchResults.forEach((settled, batchIndex) => {
      results[start + batchIndex] = settled.value;
    });
  }

  const summary = buildBulkSummary(results);
  return {
    summary: summary.summary,
    counts: {
      total: summary.total,
      success: summary.successCount,
      failed: summary.failedCount
    },
    results
  };
}

async function rollbackAtomicSuccesses({ successfulOccurrenceIds, snapshotsById, slingClient, requestId }) {
  const failures = [];

  for (let i = successfulOccurrenceIds.length - 1; i >= 0; i -= 1) {
    const occurrenceId = successfulOccurrenceIds[i];
    const snapshot = snapshotsById.get(occurrenceId);
    if (!snapshot) {
      continue;
    }

    const rollbackPayload = { ...snapshot, id: occurrenceId, openEnd: true };

    try {
      await slingClient.updateShift(occurrenceId, rollbackPayload, requestId);
    } catch (error) {
      failures.push({
        occurrenceId,
        error: {
          code: error?.code || 'ROLLBACK_FAILED',
          message: error?.message || 'Rollback failed',
          details: error?.details || null
        }
      });
    }
  }

  return {
    status: failures.length === 0 ? 'completed' : 'failed',
    failures
  };
}

async function processAtomicGroup({ group, groupIndex, slingClient, env, requestId }) {
  const groupId = group?.groupId || `group-${groupIndex + 1}`;
  const updates = group?.updates;

  if (!Array.isArray(updates) || updates.length === 0) {
    return {
      index: groupIndex,
      groupId,
      status: 'failed',
      atomic: true,
      rolledBack: true,
      counts: { total: 0, success: 0, failed: 0 },
      failure: {
        code: 'INVALID_GROUP_PAYLOAD',
        message: 'Each group must include a non-empty updates array.',
        details: null,
        conflicts: []
      },
      rollback: { status: 'skipped', failures: [] },
      results: []
    };
  }

  const snapshotsById = new Map();
  const applied = [];
  const successResults = [];

  try {
    for (let i = 0; i < updates.length; i += 1) {
      const item = updates[i];
      validateOccurrenceId(item?.occurrenceId);
      validateUpdateInput(item);
      const current = await slingClient.getShiftById(item.occurrenceId, requestId);
      assertOccurrenceCompatibility(item.occurrenceId, current);
      snapshotsById.set(item.occurrenceId, current);
    }

    for (let i = 0; i < updates.length; i += 1) {
      const item = updates[i];
      const single = await performSingleUpdate({
        occurrenceId: item.occurrenceId,
        payload: item,
        slingClient,
        env,
        requestId,
        currentShift: snapshotsById.get(item.occurrenceId)
      });

      applied.push(item.occurrenceId);
      successResults.push(toSuccess(i, single));
    }

    return {
      index: groupIndex,
      groupId,
      status: 'success',
      atomic: true,
      rolledBack: false,
      counts: { total: updates.length, success: updates.length, failed: 0 },
      rollback: { status: 'not_needed', failures: [] },
      results: successResults
    };
  } catch (error) {
    const failedOccurrenceId = updates[successResults.length]?.occurrenceId || null;
    const failure = toFailure(failedOccurrenceId, error, successResults.length);

    const rollback = await rollbackAtomicSuccesses({
      successfulOccurrenceIds: applied,
      snapshotsById,
      slingClient,
      requestId
    });

    return {
      index: groupIndex,
      groupId,
      status: 'failed',
      atomic: true,
      rolledBack: rollback.failures.length === 0,
      counts: { total: updates.length, success: 0, failed: updates.length },
      failure: failure.error,
      rollback,
      results: successResults.concat([failure])
    };
  }
}

async function rollbackCalendarFallback({ applied, slingClient, requestId }) {
  const failures = [];

  for (let i = applied.length - 1; i >= 0; i -= 1) {
    const { eventId, originalCalendarShift } = applied[i];
    const rollbackPayload = { ...originalCalendarShift, id: eventId, openEnd: true };

    try {
      await slingClient.updateShift(eventId, rollbackPayload, requestId);
    } catch (error) {
      failures.push({
        eventId,
        error: {
          code: error?.code || 'CALENDAR_ROLLBACK_FAILED',
          message: error?.message || 'Calendar fallback rollback failed',
          details: error?.details || null
        }
      });
    }
  }

  return {
    status: failures.length === 0 ? 'completed' : 'failed',
    failures
  };
}

async function processCalendarFallback({ group, groupIndex, slingClient, env, requestId }) {
  const groupId = group?.groupId || `group-${groupIndex + 1}`;
  const updates = group?.updates;

  if (!Array.isArray(updates) || updates.length === 0) return null;

  const sampleOccurrenceId = updates[0]?.occurrenceId;
  const date = extractDateFromOccurrenceId(sampleOccurrenceId);
  if (!date) return null;

  let calendarShifts;
  try {
    calendarShifts = await slingClient.getCalendarShifts(date, requestId);
  } catch {
    return null;
  }

  if (!Array.isArray(calendarShifts) || calendarShifts.length === 0) return null;

  const applied = [];
  const successResults = [];

  try {
    for (let i = 0; i < updates.length; i += 1) {
      const item = updates[i];
      const occurrenceId = item?.occurrenceId;

      let current;
      try {
        current = await slingClient.getShiftById(occurrenceId, requestId);
      } catch {
        throw new ApiError('Failed to fetch shift for calendar fallback', {
          statusCode: 502,
          code: 'CALENDAR_FALLBACK_FETCH_FAILED',
          details: { occurrenceId }
        });
      }

      const userId = current?.user?.id;
      if (!userId) {
        throw new ApiError('Shift has no user ID for calendar matching', {
          statusCode: 422,
          code: 'CALENDAR_FALLBACK_NO_USER',
          details: { occurrenceId }
        });
      }

      const calendarShift = calendarShifts.find((cs) => cs?.user?.id === userId);
      if (!calendarShift) {
        throw new ApiError('No matching calendar shift found for user', {
          statusCode: 422,
          code: 'CALENDAR_FALLBACK_NO_MATCH',
          details: { occurrenceId, userId }
        });
      }

      const eventId = extractEventId(calendarShift.id);
      const outbound = buildOutboundShift(calendarShift, eventId, item);

      const updatedRaw = await slingClient.updateShift(eventId, outbound, requestId);
      const updated = unwrapSlingShiftResponse(updatedRaw) || outbound;
      const normalizedShift = { ...outbound, ...updated };

      applied.push({ eventId, originalCalendarShift: calendarShift });
      successResults.push(toSuccess(i, {
        occurrenceId: normalizedShift.id || eventId,
        updatedShift: normalizeShiftForUi(normalizedShift, env.timezone)
      }));
    }

    return {
      index: groupIndex,
      groupId,
      status: 'success',
      atomic: true,
      rolledBack: false,
      counts: { total: updates.length, success: updates.length, failed: 0 },
      rollback: { status: 'not_needed', failures: [] },
      results: successResults
    };
  } catch (error) {
    if (applied.length > 0) {
      const rollback = await rollbackCalendarFallback({ applied, slingClient, requestId });
      if (rollback.failures.length > 0) {
        const failedOccurrenceId = updates[successResults.length]?.occurrenceId || null;
        const failure = toFailure(failedOccurrenceId, error, successResults.length);

        return {
          index: groupIndex,
          groupId,
          status: 'failed',
          atomic: true,
          rolledBack: false,
          counts: { total: updates.length, success: 0, failed: updates.length },
          failure: failure.error,
          rollback,
          results: successResults.concat([failure])
        };
      }
    }
    return null;
  }
}

async function executeSingleGroup({ group, groupIndex, slingClient, env, requestId }) {
  const atomic = group?.atomic !== false;

  if (!atomic) {
    try {
      const flat = await processFlatUpdates({
        updates: group?.updates || [],
        slingClient,
        env,
        requestId
      });
      return {
        index: groupIndex,
        groupId: group?.groupId || `group-${groupIndex + 1}`,
        status: flat.summary === 'ok' ? 'success' : 'failed',
        atomic: false,
        rolledBack: false,
        counts: flat.counts,
        rollback: { status: 'not_applicable', failures: [] },
        results: flat.results
      };
    } catch (error) {
      return {
        index: groupIndex,
        groupId: group?.groupId || `group-${groupIndex + 1}`,
        status: 'failed',
        atomic: false,
        rolledBack: false,
        counts: { total: 0, success: 0, failed: 0 },
        failure: { code: error?.code || 'GROUP_PROCESSING_FAILED', message: error?.message },
        rollback: { status: 'not_applicable', failures: [] },
        results: []
      };
    }
  }

  return processAtomicGroup({
    group,
    groupIndex,
    slingClient,
    env,
    requestId
  });
}

async function processGroupedUpdates({ groups, slingClient, env, requestId }) {
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new ApiError('groups must be a non-empty array', {
      statusCode: 400,
      code: 'INVALID_GROUPED_BULK_PAYLOAD'
    });
  }

  const results = new Array(groups.length);

  // Layer 1: Sequential processing (CONCURRENCY=1)
  for (let i = 0; i < groups.length; i += 1) {
    results[i] = await executeSingleGroup({
      group: groups[i],
      groupIndex: i,
      slingClient,
      env,
      requestId
    });
  }

  // Layer 2: Retry failed groups
  // Note: each retry calls slingClient.updateShift(), which already retries
  // 417s internally via isTransientStatus() with exponential backoff. So the
  // effective occurrence PUT count per group is (clientRetries + 1) * 2 before
  // falling through to the Layer 3 calendar fallback.
  const failedIndices = [];
  for (let i = 0; i < results.length; i += 1) {
    if (results[i].status === 'failed' && results[i].atomic !== false) {
      failedIndices.push(i);
    }
  }

  for (const idx of failedIndices) {
    const retryResult = await executeSingleGroup({
      group: groups[idx],
      groupIndex: idx,
      slingClient,
      env,
      requestId
    });
    if (retryResult.status === 'success') {
      results[idx] = retryResult;
    }
  }

  // Layer 3: Calendar-based fallback for still-failed groups
  const stillFailedIndices = [];
  for (let i = 0; i < results.length; i += 1) {
    if (results[i].status === 'failed' && results[i].atomic !== false) {
      stillFailedIndices.push(i);
    }
  }

  for (const idx of stillFailedIndices) {
    const fallbackResult = await processCalendarFallback({
      group: groups[idx],
      groupIndex: idx,
      slingClient,
      env,
      requestId
    });
    if (fallbackResult) {
      results[idx] = fallbackResult;
    }
  }

  const successGroups = results.filter((group) => group.status === 'success').length;
  const failedGroups = results.length - successGroups;
  const summary = failedGroups === 0 ? 'ok' : successGroups > 0 ? 'partial_success' : 'failed';

  return {
    summary,
    counts: {
      total: results.length,
      success: successGroups,
      failed: failedGroups
    },
    results
  };
}

export async function updateSingleOccurrence({ occurrenceId, payload, slingClient, env, requestId }) {
  const single = await performSingleUpdate({
    occurrenceId,
    payload,
    slingClient,
    env,
    requestId
  });

  return {
    requestId,
    summary: 'ok',
    timezone: env.timezone,
    data: {
      occurrenceId: single.occurrenceId,
      updatedShift: single.updatedShift
    }
  };
}

export async function updateBulkOccurrences({ payload, slingClient, env, requestId }) {
  const groupedPayload = Array.isArray(payload?.groups) ? payload.groups : null;

  if (groupedPayload) {
    const grouped = await processGroupedUpdates({
      groups: groupedPayload,
      slingClient,
      env,
      requestId
    });

    return {
      requestId,
      mode: 'grouped',
      summary: grouped.summary,
      timezone: env.timezone,
      counts: grouped.counts,
      results: grouped.results
    };
  }

  const updates = Array.isArray(payload) ? payload : payload?.updates;
  const flat = await processFlatUpdates({ updates, slingClient, env, requestId });

  return {
    requestId,
    mode: 'flat',
    summary: flat.summary,
    timezone: env.timezone,
    counts: flat.counts,
    results: flat.results
  };
}

export function normalizeSingleUpdateError(occurrenceId, error, requestId) {
  const failed = toFailure(occurrenceId, error);
  return {
    requestId,
    summary: 'failed',
    ...failed
  };
}
