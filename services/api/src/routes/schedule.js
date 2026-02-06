import { ApiError } from '../middleware/errors.js';
import { isValidIsoDate } from '../domain/timezone.js';
import {
  normalizeTeamForUi,
  normalizeUnmatchedForUi
} from '../domain/normalizers.js';

function buildNameMap(users) {
  const map = {};
  for (const user of users) {
    map[String(user.id)] = user.name;
  }
  return map;
}

export async function handleGetSchedule({ env, slingClient, caspioClient, requestId, dateIso }) {
  if (!isValidIsoDate(dateIso)) {
    throw new ApiError('Invalid date format. Expected YYYY-MM-DD', {
      statusCode: 400,
      code: 'INVALID_DATE'
    });
  }

  const [allShifts, assignments] = await Promise.all([
    slingClient.getCalendarShifts(dateIso, requestId),
    caspioClient.getTeamAssignmentsByDate(dateIso, requestId)
  ]);

  const shifts = (allShifts || []).filter((shift) => shift?.type === 'shift');
  if (!shifts.length) {
    return {
      requestId,
      summary: 'ok',
      date: dateIso,
      timezone: env.timezone,
      teams: [],
      unmatched: [],
      counts: { teams: 0, unmatched: 0, shifts: 0 }
    };
  }

  const assistIds = assignments
    .map((a) => a.tbl_team_assignment_Team_Assist_ID)
    .filter(Boolean);

  const assistSlingRecords = await caspioClient.getEntertainerSlingIds(assistIds, requestId);
  const assistMap = {};
  for (const record of assistSlingRecords) {
    assistMap[String(record.Entertainer_ID)] = String(record.SLING_ID);
  }

  const teams = [];
  const matchedShiftIds = new Set();

  for (const assignment of assignments) {
    const teamName = assignment.tbl_team_assignment_Team;
    const mainSlingId = String(assignment.tbl_entertainers_Sling_ID || '');
    const assistSlingId = String(assistMap[String(assignment.tbl_team_assignment_Team_Assist_ID)] || '');

    if (!teamName || !mainSlingId || !assistSlingId) {
      continue;
    }

    const mainShift = shifts.find((s) => String(s?.user?.id) === mainSlingId);
    const assistShift = shifts.find((s) => String(s?.user?.id) === assistSlingId);

    if (!mainShift || !assistShift) {
      continue;
    }

    teams.push({ teamName, mainShift, assistShift });
    matchedShiftIds.add(mainShift.id);
    matchedShiftIds.add(assistShift.id);
  }

  const unmatchedShifts = shifts.filter((shift) => !matchedShiftIds.has(shift.id));

  const userIds = [...new Set(shifts.map((shift) => String(shift.user.id)))];
  const users = await slingClient.getUsersByIds(userIds, requestId);
  const names = buildNameMap(users);

  return {
    requestId,
    summary: 'ok',
    date: dateIso,
    timezone: env.timezone,
    teams: teams.map((team) =>
      normalizeTeamForUi(team.teamName, team.mainShift, team.assistShift, names, env.timezone)
    ),
    unmatched: unmatchedShifts.map((shift) => normalizeUnmatchedForUi(shift, names, env.timezone)),
    counts: {
      teams: teams.length,
      unmatched: unmatchedShifts.length,
      shifts: shifts.length
    }
  };
}
