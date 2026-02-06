const state = {
  schedule: null,
  bulkMode: false,
  loading: false
};

const els = {
  dateInput: document.getElementById('dateInput'),
  searchBtn: document.getElementById('searchBtn'),
  flash: document.getElementById('flash'),
  teamsSection: document.getElementById('teamsSection'),
  teamsBody: document.querySelector('#teamsTable tbody'),
  unmatchedSection: document.getElementById('unmatchedSection'),
  unmatchedBody: document.querySelector('#unmatchedTable tbody'),
  bulkEditBtn: document.getElementById('bulkEditBtn'),
  bulkSaveBtn: document.getElementById('bulkSaveBtn'),
  bulkCancelBtn: document.getElementById('bulkCancelBtn')
};

const API_BASE = window.__SCHEDULER_API_BASE__ || '';

function buildRequestId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showFlash(type, message) {
  els.flash.className = `flash show ${type}`;
  els.flash.textContent = message;
}

function clearFlash() {
  els.flash.className = 'flash';
  els.flash.textContent = '';
}

function setLoading(isLoading) {
  state.loading = isLoading;
  els.searchBtn.disabled = isLoading;
  els.bulkEditBtn.disabled = isLoading;
  els.bulkSaveBtn.disabled = isLoading;
  els.bulkCancelBtn.disabled = isLoading;
}

async function apiRequest(path, options = {}) {
  const requestId = buildRequestId();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `HTTP ${response.status}`);
    error.payload = payload;
    throw error;
  }

  return payload;
}

function toIsoFromCaspioDate(value) {
  if (!value) return '';
  const parts = value.split('/');
  if (parts.length !== 3) return '';
  const [month, day, year] = parts;
  if (!month || !day || !year) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function readTeamRowValues(row) {
  return {
    startTime: row.querySelector('[data-field="startTime"]').value,
    endTime: row.querySelector('[data-field="endTime"]').value,
    status: row.querySelector('[data-field="status"]').value
  };
}

function hasTeamRowChanges(row) {
  const current = readTeamRowValues(row);
  return (
    current.startTime !== row.dataset.originalStart ||
    current.endTime !== row.dataset.originalEnd ||
    current.status !== row.dataset.originalStatus
  );
}

function setTeamRowEditing(row, editing) {
  row.classList.toggle('editing', editing);
  row.querySelectorAll('input,select').forEach((el) => {
    el.disabled = !editing;
  });

  const editBtn = row.querySelector('[data-action="edit"]');
  const saveBtn = row.querySelector('[data-action="save"]');
  const cancelBtn = row.querySelector('[data-action="cancel"]');

  editBtn.hidden = editing;
  saveBtn.hidden = !editing;
  cancelBtn.hidden = !editing;
}

function resetTeamRow(row) {
  row.querySelector('[data-field="startTime"]').value = row.dataset.originalStart;
  row.querySelector('[data-field="endTime"]').value = row.dataset.originalEnd;
  row.querySelector('[data-field="status"]').value = row.dataset.originalStatus;
  setTeamRowEditing(row, false);
}

function renderTeams() {
  els.teamsBody.innerHTML = '';

  for (const [index, team] of state.schedule.teams.entries()) {
    const row = document.createElement('tr');
    row.dataset.teamIndex = String(index);
    row.dataset.originalStart = team.startTime;
    row.dataset.originalEnd = team.endTime;
    row.dataset.originalStatus = team.status;

    row.innerHTML = `
      <td>${team.teamName}</td>
      <td>${team.main.name}</td>
      <td>${team.assist.name}</td>
      <td><input data-field="startTime" type="time" value="${team.startTime}" disabled /></td>
      <td><input data-field="endTime" type="time" value="${team.endTime}" disabled /></td>
      <td>
        <select data-field="status" disabled>
          <option value="published" ${team.status === 'published' ? 'selected' : ''}>Published</option>
          <option value="planning" ${team.status === 'planning' ? 'selected' : ''}>Unpublished</option>
        </select>
      </td>
      <td>
        <button data-action="edit" type="button">Edit</button>
        <button data-action="save" type="button" hidden>Save</button>
        <button data-action="cancel" type="button" hidden>Cancel</button>
      </td>
    `;

    row.querySelector('[data-action="edit"]').addEventListener('click', () => {
      if (state.bulkMode) return;
      setTeamRowEditing(row, true);
    });

    row.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      resetTeamRow(row);
    });

    row.querySelector('[data-action="save"]').addEventListener('click', async () => {
      await saveTeamRow(row, team);
    });

    els.teamsBody.appendChild(row);
  }

  els.teamsSection.hidden = state.schedule.teams.length === 0;
}

function renderUnmatched() {
  els.unmatchedBody.innerHTML = '';

  for (const unmatched of state.schedule.unmatched) {
    const shift = unmatched.shift;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${unmatched.name}</td>
      <td><input data-field="startTime" type="time" value="${shift.startTime}" /></td>
      <td><input data-field="endTime" type="time" value="${shift.endTime}" /></td>
      <td>
        <select data-field="status">
          <option value="published" ${shift.status === 'published' ? 'selected' : ''}>Published</option>
          <option value="planning" ${shift.status === 'planning' ? 'selected' : ''}>Unpublished</option>
        </select>
      </td>
      <td><button data-action="update" type="button">Update</button></td>
    `;

    row.querySelector('[data-action="update"]').addEventListener('click', async () => {
      await updateUnmatchedShift(shift.id, row);
    });

    els.unmatchedBody.appendChild(row);
  }

  els.unmatchedSection.hidden = state.schedule.unmatched.length === 0;
}

function render() {
  if (!state.schedule) {
    els.teamsSection.hidden = true;
    els.unmatchedSection.hidden = true;
    return;
  }

  renderTeams();
  renderUnmatched();
}

async function loadSchedule() {
  const date = els.dateInput.value;
  if (!date) {
    showFlash('warn', 'Select a date first.');
    return;
  }

  clearFlash();
  setLoading(true);

  try {
    const data = await apiRequest(`/api/schedule?date=${encodeURIComponent(date)}`);
    state.schedule = data;
    state.bulkMode = false;
    render();

    showFlash('ok', `Loaded ${data.counts.teams} teams and ${data.counts.unmatched} unmatched shifts.`);
  } catch (error) {
    const requestId = error?.payload?.requestId;
    showFlash('error', `Schedule load failed${requestId ? ` (requestId: ${requestId})` : ''}. ${error.message}`);
  } finally {
    setLoading(false);
    syncBulkButtons();
  }
}

async function saveTeamRow(row, team) {
  if (!hasTeamRowChanges(row)) {
    resetTeamRow(row);
    return;
  }

  const values = readTeamRowValues(row);
  setLoading(true);

  try {
    const payload = {
      updates: [
        {
          occurrenceId: team.main.shift.id,
          startTime: values.startTime,
          endTime: values.endTime,
          status: values.status
        },
        {
          occurrenceId: team.assist.shift.id,
          startTime: values.startTime,
          endTime: values.endTime,
          status: values.status
        }
      ]
    };

    const result = await apiRequest('/api/shifts/bulk', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    await loadSchedule();
    const message =
      result.summary === 'ok'
        ? 'Team updated successfully.'
        : `Team update partial success (${result.counts.success}/${result.counts.total}).`;
    showFlash(result.summary === 'ok' ? 'ok' : 'warn', `${message} requestId: ${result.requestId}`);
  } catch (error) {
    const requestId = error?.payload?.requestId;
    showFlash('error', `Team update failed${requestId ? ` (requestId: ${requestId})` : ''}. ${error.message}`);
  } finally {
    setLoading(false);
    syncBulkButtons();
  }
}

async function updateUnmatchedShift(occurrenceId, row) {
  const startTime = row.querySelector('[data-field="startTime"]').value;
  const endTime = row.querySelector('[data-field="endTime"]').value;
  const status = row.querySelector('[data-field="status"]').value;

  setLoading(true);

  try {
    const result = await apiRequest(`/api/shifts/${encodeURIComponent(occurrenceId)}`, {
      method: 'PUT',
      body: JSON.stringify({ startTime, endTime, status })
    });

    await loadSchedule();
    showFlash('ok', `Unmatched shift updated. requestId: ${result.requestId}`);
  } catch (error) {
    const requestId = error?.payload?.requestId;
    showFlash('error', `Unmatched shift update failed${requestId ? ` (requestId: ${requestId})` : ''}. ${error.message}`);
  } finally {
    setLoading(false);
    syncBulkButtons();
  }
}

function syncBulkButtons() {
  if (!state.schedule || state.schedule.teams.length === 0) {
    els.bulkEditBtn.hidden = false;
    els.bulkSaveBtn.hidden = true;
    els.bulkCancelBtn.hidden = true;
    return;
  }

  els.bulkEditBtn.hidden = state.bulkMode;
  els.bulkSaveBtn.hidden = !state.bulkMode;
  els.bulkCancelBtn.hidden = !state.bulkMode;
}

function enterBulkMode() {
  state.bulkMode = true;
  els.teamsBody.querySelectorAll('tr').forEach((row) => setTeamRowEditing(row, true));
  syncBulkButtons();
}

function cancelBulkMode() {
  state.bulkMode = false;
  els.teamsBody.querySelectorAll('tr').forEach((row) => resetTeamRow(row));
  syncBulkButtons();
}

async function saveBulk() {
  const updates = [];

  for (const row of els.teamsBody.querySelectorAll('tr')) {
    if (!hasTeamRowChanges(row)) continue;

    const teamIndex = Number(row.dataset.teamIndex);
    const team = state.schedule.teams[teamIndex];
    const values = readTeamRowValues(row);

    updates.push(
      {
        occurrenceId: team.main.shift.id,
        startTime: values.startTime,
        endTime: values.endTime,
        status: values.status
      },
      {
        occurrenceId: team.assist.shift.id,
        startTime: values.startTime,
        endTime: values.endTime,
        status: values.status
      }
    );
  }

  if (!updates.length) {
    showFlash('warn', 'No changes to save.');
    cancelBulkMode();
    return;
  }

  setLoading(true);

  try {
    const result = await apiRequest('/api/shifts/bulk', {
      method: 'POST',
      body: JSON.stringify({ updates })
    });

    await loadSchedule();
    const type = result.summary === 'ok' ? 'ok' : 'warn';
    showFlash(type, `Bulk update ${result.summary}. Success ${result.counts.success}/${result.counts.total}. requestId: ${result.requestId}`);
  } catch (error) {
    const requestId = error?.payload?.requestId;
    showFlash('error', `Bulk update failed${requestId ? ` (requestId: ${requestId})` : ''}. ${error.message}`);
  } finally {
    setLoading(false);
    state.bulkMode = false;
    syncBulkButtons();
  }
}

function setDateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const caspioDate = params.get('date');
  const isoDate = toIsoFromCaspioDate(caspioDate);
  if (!isoDate) return;
  els.dateInput.value = isoDate;
  loadSchedule();
}

function registerEvents() {
  els.searchBtn.addEventListener('click', loadSchedule);
  els.dateInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') loadSchedule();
  });

  els.bulkEditBtn.addEventListener('click', enterBulkMode);
  els.bulkCancelBtn.addEventListener('click', cancelBulkMode);
  els.bulkSaveBtn.addEventListener('click', saveBulk);
}

registerEvents();
syncBulkButtons();
setDateFromQuery();
