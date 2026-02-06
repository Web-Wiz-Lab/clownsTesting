import {
  extractDateFromIsoDateTime,
  extractTimeFromIsoDateTime,
  formatTimeForDisplay
} from './timezone.js';

export function normalizeSlingConflict(errorPayload) {
  const conflicts = Array.isArray(errorPayload?.conflicts) ? errorPayload.conflicts : [];
  return conflicts.map((conflict) => ({
    type: conflict.type || 'unknown',
    employeeId: conflict?.user?.id || null,
    shiftId: conflict.id || null,
    conflictWindow: {
      start: conflict.dtstart || null,
      end: conflict.dtend || null
    },
    raw: conflict
  }));
}

export function normalizeShiftForUi(shift, timezone) {
  const startTime = extractTimeFromIsoDateTime(shift.dtstart);
  const endTime = extractTimeFromIsoDateTime(shift.dtend);

  return {
    id: shift.id,
    userId: shift?.user?.id || null,
    status: shift.status,
    dtstart: shift.dtstart,
    dtend: shift.dtend,
    startTime,
    endTime,
    startLabel: formatTimeForDisplay(shift.dtstart, timezone),
    endLabel: formatTimeForDisplay(shift.dtend, timezone),
    date: extractDateFromIsoDateTime(shift.dtstart),
    locationId: shift?.location?.id || null,
    positionId: shift?.position?.id || null,
    hasRecurrence: Boolean(shift.rrule)
  };
}

export function normalizeTeamForUi(teamName, mainShift, assistShift, names, timezone) {
  return {
    teamName,
    status: mainShift.status,
    startTime: extractTimeFromIsoDateTime(mainShift.dtstart),
    endTime: extractTimeFromIsoDateTime(mainShift.dtend),
    main: {
      slingId: mainShift.user.id,
      name: names[String(mainShift.user.id)] || String(mainShift.user.id),
      shift: normalizeShiftForUi(mainShift, timezone)
    },
    assist: {
      slingId: assistShift.user.id,
      name: names[String(assistShift.user.id)] || String(assistShift.user.id),
      shift: normalizeShiftForUi(assistShift, timezone)
    }
  };
}

export function normalizeUnmatchedForUi(shift, names, timezone) {
  return {
    name: names[String(shift.user.id)] || String(shift.user.id),
    shift: normalizeShiftForUi(shift, timezone)
  };
}

export function buildBulkSummary(results) {
  const successCount = results.filter((r) => r.status === 'success').length;
  const failedCount = results.length - successCount;
  const summary = failedCount === 0 ? 'ok' : successCount > 0 ? 'partial_success' : 'failed';

  return {
    summary,
    successCount,
    failedCount,
    total: results.length
  };
}
