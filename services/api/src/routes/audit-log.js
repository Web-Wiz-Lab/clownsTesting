export function extractScheduleDate(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  for (const group of results) {
    const groupResults = Array.isArray(group?.results) ? group.results : [];
    for (const item of groupResults) {
      if (item?.data?.date) {
        return item.data.date;
      }
    }
  }
  return null;
}

export function mapAuditEntry(raw) {
  const groups = Array.isArray(raw.body?.groups) ? raw.body.groups : [];
  const isBulk = groups.length > 1;
  const scheduleDate = extractScheduleDate(raw.payload);
  const payloadResults = Array.isArray(raw.payload?.results) ? raw.payload.results : [];

  const groupDetails = groups.map((g, i) => ({
    groupId: g.groupId || `Group ${i + 1}`,
    status: payloadResults[i]?.status || 'unknown'
  }));

  const formattedDate = scheduleDate
    ? new Date(scheduleDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  let summary;
  if (isBulk) {
    summary = `Bulk edit ${groups.length} teams` + (formattedDate ? ` for ${formattedDate}` : '');
  } else if (groups.length === 1) {
    const teamName = groups[0].groupId || 'Unknown team';
    summary = `${teamName} shifts updated` + (formattedDate ? ` for ${formattedDate}` : '');
  } else {
    summary = 'Shift update';
  }

  return {
    id: raw.id || raw.requestId,
    timestamp: raw.timestamp instanceof Date ? raw.timestamp.toISOString() : String(raw.timestamp || ''),
    outcome: raw.outcome || 'unknown',
    type: isBulk ? 'bulk' : 'single',
    summary,
    scheduleDate: scheduleDate || null,
    requestId: raw.requestId || null,
    groups: groupDetails
  };
}

export async function handleGetAuditLog({ auditStorePromise, query, requestId }) {
  const limitRaw = parseInt(query.get('limit') || '20', 10);
  const limit = Math.min(Math.max(limitRaw || 20, 1), 50);
  const cursor = query.get('cursor') || null;

  const store = await auditStorePromise;
  const result = await store.query({ limit, cursor });

  return {
    requestId,
    entries: result.entries.map(mapAuditEntry),
    nextCursor: result.nextCursor
  };
}
