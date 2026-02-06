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
  if (!occurrenceId || !occurrenceId.includes(':')) {
    throw new ApiError('Occurrence ID must include a series and date suffix (example: 12345:2026-02-07)', {
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

export async function updateSingleOccurrence({ occurrenceId, payload, slingClient, env, requestId }) {
  validateOccurrenceId(occurrenceId);
  validateUpdateInput(payload);

  const current = await slingClient.getShiftById(occurrenceId, requestId);
  const date = extractDateFromIsoDateTime(current.dtstart);
  const offset = resolveOffset(current);

  const outbound = { ...current };
  outbound.id = occurrenceId;
  outbound.openEnd = true;

  if (payload.startTime && payload.endTime) {
    outbound.dtstart = buildDateTime(date, payload.startTime, offset);
    outbound.dtend = buildDateTime(date, payload.endTime, offset);
  }

  if (payload.status) {
    outbound.status = payload.status;
  }

  const updated = await slingClient.updateShift(occurrenceId, outbound, requestId);

  return {
    requestId,
    summary: 'ok',
    timezone: env.timezone,
    data: {
      occurrenceId,
      updatedShift: normalizeShiftForUi(updated, env.timezone)
    }
  };
}

export async function updateBulkOccurrences({ updates, slingClient, env, requestId }) {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new ApiError('updates must be a non-empty array', {
      statusCode: 400,
      code: 'INVALID_BULK_PAYLOAD'
    });
  }

  const results = [];

  for (let index = 0; index < updates.length; index += 1) {
    const item = updates[index];
    const occurrenceId = item?.occurrenceId;

    try {
      const single = await updateSingleOccurrence({
        occurrenceId,
        payload: item,
        slingClient,
        env,
        requestId
      });

      results.push({
        index,
        occurrenceId,
        status: 'success',
        data: single.data.updatedShift
      });
    } catch (error) {
      results.push(toFailure(occurrenceId, error, index));
    }
  }

  const summary = buildBulkSummary(results);

  return {
    requestId,
    summary: summary.summary,
    timezone: env.timezone,
    counts: {
      total: summary.total,
      success: summary.successCount,
      failed: summary.failedCount
    },
    results
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
