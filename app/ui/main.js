let teamsData = {};
let unmatchedShiftsData = [];
let bulkEditMode = false;
let bulkEditOriginalValues = {};

const API_BASE = window.__SCHEDULER_API_BASE__ || '';

function buildRequestId() {
    if (window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
    }
    return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function apiRequest(path, method = 'GET', body = null) {
    const requestId = buildRequestId();
    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': requestId
        },
        body: body ? JSON.stringify(body) : undefined
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch {
        payload = {};
    }

    if (!response.ok) {
        const err = new Error(payload?.error?.message || `HTTP ${response.status}`);
        err.payload = payload;
        throw err;
    }

    return payload;
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    successMessage.classList.remove('active');
    errorMessage.textContent = message;
    errorMessage.classList.add('active');
}

function showSuccess(message, timeoutMs = 3000) {
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.classList.remove('active');
    successMessage.textContent = message;
    successMessage.classList.add('active');
    if (timeoutMs > 0) {
        setTimeout(() => successMessage.classList.remove('active'), timeoutMs);
    }
}

function clearMessages() {
    document.getElementById('errorMessage').classList.remove('active');
    document.getElementById('successMessage').classList.remove('active');
}

function formatTime24To12(time24) {
    const [hours24, minutes] = time24.split(':');
    let hours = parseInt(hours24, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
}

function getTimeFromDateTime(dateTimeString) {
    const timeMatch = String(dateTimeString || '').match(/T(\d{2}):(\d{2})/);
    if (timeMatch) {
        return `${timeMatch[1]}:${timeMatch[2]}`;
    }

    const date = new Date(dateTimeString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function formatTime(dateTimeString) {
    return formatTime24To12(getTimeFromDateTime(dateTimeString));
}

function createTimeSelect(selectedTime24, minTime24 = null) {
    const select = document.createElement('select');
    select.className = 'modern-time-select';

    let minMinutes = null;
    if (minTime24) {
        const [minHours, minMins] = minTime24.split(':').map(Number);
        minMinutes = minHours * 60 + minMins;
    }

    const ranges = [
        { label: 'MORNING', start: 6, end: 11 },
        { label: 'AFTERNOON', start: 12, end: 17 },
        { label: 'EVENING', start: 18, end: 23 }
    ];

    ranges.forEach((range) => {
        const group = document.createElement('optgroup');
        group.label = range.label;
        let hasOptions = false;

        for (let hour = range.start; hour <= range.end; hour += 1) {
            for (let minute = 0; minute < 60; minute += 15) {
                const time24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                const currentMinutes = hour * 60 + minute;

                if (minMinutes !== null && currentMinutes <= minMinutes) {
                    continue;
                }

                const option = document.createElement('option');
                option.value = time24;
                option.textContent = formatTime24To12(time24);
                if (time24 === selectedTime24) {
                    option.selected = true;
                }
                group.appendChild(option);
                hasOptions = true;
            }
        }

        if (hasOptions) {
            select.appendChild(group);
        }
    });

    return select;
}

function createStatusSelect(currentStatus) {
    const select = document.createElement('select');
    select.className = 'modern-time-select';

    const publishOption = document.createElement('option');
    publishOption.value = 'published';
    publishOption.textContent = 'Publish';
    if (currentStatus === 'published') {
        publishOption.selected = true;
    }
    select.appendChild(publishOption);

    const unpublishOption = document.createElement('option');
    unpublishOption.value = 'planning';
    unpublishOption.textContent = 'Unpublish';
    if (currentStatus === 'planning') {
        unpublishOption.selected = true;
    }
    select.appendChild(unpublishOption);

    return select;
}

function toggleUnmatchedShifts() {
    const container = document.getElementById('unmatchedShiftsContainer');
    const arrow = document.getElementById('warningArrow');

    container.classList.toggle('active');
    arrow.classList.toggle('expanded');
}

function getRequestIdFromError(error) {
    return error?.payload?.requestId ? ` (requestId: ${error.payload.requestId})` : '';
}

function showModal(message, type) {
    const modal = document.getElementById('modalOverlay');
    const modalMessage = document.getElementById('modalMessage');
    const loader = document.getElementById('modalLoader');
    const successIcon = document.getElementById('modalSuccess');
    const errorIcon = document.getElementById('modalError');

    modalMessage.textContent = message;

    loader.style.display = 'none';
    successIcon.style.display = 'none';
    errorIcon.style.display = 'none';

    if (type === 'loading') {
        loader.style.display = 'block';
    } else if (type === 'success') {
        successIcon.style.display = 'block';
    } else if (type === 'error') {
        errorIcon.style.display = 'block';
    }

    modal.classList.add('active');
}

function hideModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

function normalizeScheduleToUi(data) {
    teamsData = {};
    unmatchedShiftsData = [];

    (data.teams || []).forEach((team) => {
        teamsData[team.teamName] = {
            teamName: team.teamName,
            mainName: team.main.name,
            assistName: team.assist.name,
            mainShift: {
                id: team.main.shift.id,
                dtstart: team.main.shift.dtstart,
                dtend: team.main.shift.dtend,
                status: team.main.shift.status,
                user: { id: team.main.slingId }
            },
            assistShift: {
                id: team.assist.shift.id,
                dtstart: team.assist.shift.dtstart,
                dtend: team.assist.shift.dtend,
                status: team.assist.shift.status,
                user: { id: team.assist.slingId }
            }
        };
    });

    (data.unmatched || []).forEach((item) => {
        unmatchedShiftsData.push({
            id: item.shift.id,
            dtstart: item.shift.dtstart,
            dtend: item.shift.dtend,
            status: item.shift.status,
            user: { id: item.shift.userId || item.name },
            displayName: item.name
        });
    });
}

function displayUnmatchedShifts() {
    const container = document.getElementById('unmatchedShiftsContainer');
    container.innerHTML = '';

    const explainer = document.createElement('div');
    explainer.className = 'unmatched-explainer';
    explainer.textContent = 'These shifts exist in Sling but are not linked to any team assignment in Caspio.';
    container.appendChild(explainer);

    const table = document.createElement('table');
    table.className = 'unmatched-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Name</th>
            <th>Start</th>
            <th>End</th>
            <th>Status</th>
            <th>Actions</th>
        </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    unmatchedShiftsData.forEach((shift, index) => {
        const startTime = formatTime(shift.dtstart);
        const endTime = formatTime(shift.dtend);
        const statusClass = shift.status === 'published' ? 'published' : 'unpublished';
        const statusText = shift.status === 'published' ? 'Published' : 'Unpublished';

        const row = document.createElement('tr');
        row.dataset.unmatchedIndex = String(index);
        row.dataset.originalStart = getTimeFromDateTime(shift.dtstart);
        row.dataset.originalEnd = getTimeFromDateTime(shift.dtend);
        row.dataset.originalStatus = shift.status;

        row.innerHTML = `
            <td><strong>${shift.displayName}</strong></td>
            <td class="time-cell">
                <span class="time-display">${startTime}</span>
                <span class="time-edit"></span>
            </td>
            <td class="time-cell">
                <span class="time-display">${endTime}</span>
                <span class="time-edit"></span>
            </td>
            <td class="status-cell">
                <span class="status-display"><span class="status-badge ${statusClass}">${statusText}</span></span>
                <span class="status-edit"></span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-edit" onclick="editUnmatchedShift(${index})">Edit</button>
                </div>
            </td>
        `;

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);
}

function renderTeamsTable() {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';

    const teamNames = Object.keys(teamsData);
    teamNames.forEach((teamName, index) => {
        const team = teamsData[teamName];
        const startTime = formatTime(team.mainShift.dtstart);
        const endTime = formatTime(team.mainShift.dtend);
        const status = team.mainShift.status;
        const statusClass = status === 'published' ? 'published' : 'unpublished';
        const statusText = status === 'published' ? 'Published' : 'Unpublished';

        const row = document.createElement('tr');
        row.dataset.teamIndex = String(index);
        row.dataset.teamName = teamName;
        row.dataset.originalStart = getTimeFromDateTime(team.mainShift.dtstart);
        row.dataset.originalEnd = getTimeFromDateTime(team.mainShift.dtend);
        row.dataset.originalStatus = status;

        row.innerHTML = `
            <td><span class="team-name">${teamName}</span></td>
            <td>${team.mainName}</td>
            <td>${team.assistName}</td>
            <td class="time-cell">
                <span class="time-display">${startTime}</span>
                <span class="time-edit"></span>
            </td>
            <td class="time-cell">
                <span class="time-display">${endTime}</span>
                <span class="time-edit"></span>
            </td>
            <td class="status-cell">
                <span class="status-display"><span class="status-badge ${statusClass}">${statusText}</span></span>
                <span class="status-edit"></span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-edit" onclick="editTeam('${teamName.replace(/'/g, "\\'")}')">Edit</button>
                </div>
            </td>
        `;

        tableBody.appendChild(row);
    });
}

async function searchSchedule() {
    const dateInput = document.getElementById('dateInput');
    const searchBtn = document.getElementById('searchBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const warningMessage = document.getElementById('warningMessage');
    const noResults = document.getElementById('noResults');
    const resultsTable = document.getElementById('resultsTable');

    if (!dateInput.value) {
        alert('Please select a date');
        return;
    }

    clearMessages();
    warningMessage.classList.remove('active');
    noResults.classList.remove('active');
    resultsTable.classList.remove('active');
    document.getElementById('tableBody').innerHTML = '';
    teamsData = {};
    unmatchedShiftsData = [];
    bulkEditMode = false;
    bulkEditOriginalValues = {};

    document.getElementById('bulkControls').style.display = 'none';
    document.getElementById('editAllBtn').style.display = 'inline-block';
    document.getElementById('editAllBtn').disabled = false;
    document.getElementById('updateAllBtn').style.display = 'none';
    document.getElementById('cancelAllBtn').style.display = 'none';

    searchBtn.disabled = true;
    loadingIndicator.classList.add('active');

    try {
        const data = await apiRequest(`/api/schedule?date=${encodeURIComponent(dateInput.value)}`);
        normalizeScheduleToUi(data);

        const teamNames = Object.keys(teamsData);
        if (teamNames.length === 0 && unmatchedShiftsData.length === 0) {
            noResults.classList.add('active');
            return;
        }

        if (teamNames.length > 0) {
            renderTeamsTable();
            resultsTable.classList.add('active');
            document.getElementById('bulkControls').style.display = 'flex';
        } else {
            noResults.classList.add('active');
        }

        if (unmatchedShiftsData.length > 0) {
            displayUnmatchedShifts();
            const warningText = document.getElementById('warningText');
            const shiftWord = unmatchedShiftsData.length === 1 ? 'shift' : 'shifts';
            warningText.textContent = `Warning: ${unmatchedShiftsData.length} ${shiftWord} could not be matched to a team. (Click to expand)`;
            warningMessage.classList.add('active');
        }
    } catch (error) {
        showError(`Schedule load failed${getRequestIdFromError(error)}. ${error.message}`);
    } finally {
        searchBtn.disabled = false;
        loadingIndicator.classList.remove('active');
    }
}

function editTeam(teamName) {
    const row = document.querySelector(`tr[data-team-name="${CSS.escape(teamName)}"]`);
    const team = teamsData[teamName];
    if (!row || !team) return;

    row.classList.add('editing');
    document.getElementById('editAllBtn').disabled = true;

    const startTimeCell = row.querySelectorAll('.time-cell')[0];
    const endTimeCell = row.querySelectorAll('.time-cell')[1];
    const statusCell = row.querySelector('.status-cell');

    const startTime24 = getTimeFromDateTime(team.mainShift.dtstart);
    const endTime24 = getTimeFromDateTime(team.mainShift.dtend);

    const startSelect = createTimeSelect(startTime24);
    let endSelect = createTimeSelect(endTime24, startTime24);
    const statusSelect = createStatusSelect(team.mainShift.status);

    startSelect.addEventListener('change', () => {
        const newStartTime = startSelect.value;
        const currentEndTime = endSelect.value;

        const newEndSelect = createTimeSelect(currentEndTime, newStartTime);
        newEndSelect.addEventListener('change', () => checkIfTeamEdited(teamName));

        endTimeCell.querySelector('.time-edit').innerHTML = '';
        endTimeCell.querySelector('.time-edit').appendChild(newEndSelect);
        endSelect = newEndSelect;

        checkIfTeamEdited(teamName);
    });

    endSelect.addEventListener('change', () => checkIfTeamEdited(teamName));
    statusSelect.addEventListener('change', () => checkIfTeamEdited(teamName));

    startTimeCell.querySelector('.time-edit').appendChild(startSelect);
    endTimeCell.querySelector('.time-edit').appendChild(endSelect);
    statusCell.querySelector('.status-edit').appendChild(statusSelect);

    row.querySelector('.action-buttons').innerHTML = `
        <button class="btn-update" onclick="updateTeam('${teamName.replace(/'/g, "\\'")}')">Update</button>
        <button class="btn-cancel" onclick="cancelTeamEdit('${teamName.replace(/'/g, "\\'")}')">Cancel</button>
    `;
}

function checkIfTeamEdited(teamName) {
    const row = document.querySelector(`tr[data-team-name="${CSS.escape(teamName)}"]`);
    if (!row) return;

    const startSelect = row.querySelectorAll('.time-cell')[0].querySelector('select');
    const endSelect = row.querySelectorAll('.time-cell')[1].querySelector('select');
    const statusSelect = row.querySelector('.status-cell select');

    if (!startSelect || !endSelect || !statusSelect) return;

    const originalStart = row.dataset.originalStart;
    const originalEnd = row.dataset.originalEnd;
    const originalStatus = row.dataset.originalStatus;

    if (startSelect.value !== originalStart || endSelect.value !== originalEnd || statusSelect.value !== originalStatus) {
        row.classList.add('edited');
    } else {
        row.classList.remove('edited');
    }
}

function cancelTeamEdit(teamName) {
    const row = document.querySelector(`tr[data-team-name="${CSS.escape(teamName)}"]`);
    if (!row) return;

    row.classList.remove('editing');
    row.classList.remove('edited');
    document.getElementById('editAllBtn').disabled = false;

    row.querySelectorAll('.time-edit').forEach((el) => {
        el.innerHTML = '';
    });
    row.querySelector('.status-edit').innerHTML = '';
    row.querySelector('.action-buttons').innerHTML = `<button class="btn-edit" onclick="editTeam('${teamName.replace(/'/g, "\\'")}')">Edit</button>`;
}

async function updateTeam(teamName) {
    const row = document.querySelector(`tr[data-team-name="${CSS.escape(teamName)}"]`);
    const team = teamsData[teamName];
    if (!row || !team) return;

    const startSelect = row.querySelectorAll('.time-cell')[0].querySelector('select');
    const endSelect = row.querySelectorAll('.time-cell')[1].querySelector('select');
    const statusSelect = row.querySelector('.status-cell select');

    if (!startSelect || !endSelect || !statusSelect) {
        alert('Error: Selects not found');
        return;
    }

    const newStartTime = startSelect.value;
    const newEndTime = endSelect.value;
    const newStatus = statusSelect.value;

    const originalStart = row.dataset.originalStart;
    const originalEnd = row.dataset.originalEnd;
    const originalStatus = row.dataset.originalStatus;

    const timeChanged = newStartTime !== originalStart || newEndTime !== originalEnd;
    const statusChanged = newStatus !== originalStatus;

    if (!timeChanged && !statusChanged) {
        cancelTeamEdit(teamName);
        return;
    }

    const updateBtn = row.querySelector('.btn-update');
    const cancelBtn = row.querySelector('.btn-cancel');
    updateBtn.disabled = true;
    cancelBtn.disabled = true;
    updateBtn.textContent = 'Updating...';

    try {
        const result = await apiRequest('/api/shifts/bulk', 'POST', {
            updates: [
                {
                    occurrenceId: team.mainShift.id,
                    startTime: newStartTime,
                    endTime: newEndTime,
                    status: newStatus
                },
                {
                    occurrenceId: team.assistShift.id,
                    startTime: newStartTime,
                    endTime: newEndTime,
                    status: newStatus
                }
            ]
        });

        if (result.summary !== 'ok') {
            throw new Error(`Partial update (${result.counts.success}/${result.counts.total})`);
        }

        await searchSchedule();
        showSuccess('Team updated successfully!');
    } catch (error) {
        showError(`Error updating team${getRequestIdFromError(error)}: ${error.message}`);
        updateBtn.disabled = false;
        cancelBtn.disabled = false;
        updateBtn.textContent = 'Update';
    }
}

function checkIfAnyTeamBeingEdited() {
    return document.querySelectorAll('tr.editing').length > 0;
}

function enterBulkEditMode() {
    if (checkIfAnyTeamBeingEdited()) {
        alert('Please finish or cancel the current edit before using Edit All');
        return;
    }

    bulkEditMode = true;
    bulkEditOriginalValues = {};

    Object.keys(teamsData).forEach((teamName) => {
        const team = teamsData[teamName];
        bulkEditOriginalValues[teamName] = {
            start: getTimeFromDateTime(team.mainShift.dtstart),
            end: getTimeFromDateTime(team.mainShift.dtend),
            status: team.mainShift.status
        };
    });

    Object.keys(teamsData).forEach((teamName) => {
        const row = document.querySelector(`tr[data-team-name="${CSS.escape(teamName)}"]`);
        const team = teamsData[teamName];
        if (!row) return;

        row.classList.add('editing', 'bulk-editing');

        const startTimeCell = row.querySelectorAll('.time-cell')[0];
        const endTimeCell = row.querySelectorAll('.time-cell')[1];
        const statusCell = row.querySelector('.status-cell');

        const startTime24 = getTimeFromDateTime(team.mainShift.dtstart);
        const endTime24 = getTimeFromDateTime(team.mainShift.dtend);

        const startSelect = createTimeSelect(startTime24);
        let endSelect = createTimeSelect(endTime24, startTime24);
        const statusSelect = createStatusSelect(team.mainShift.status);

        startSelect.addEventListener('change', () => {
            const newStartTime = startSelect.value;
            const currentEndTime = endSelect.value;

            const newEndSelect = createTimeSelect(currentEndTime, newStartTime);
            newEndSelect.addEventListener('change', () => checkIfTeamEditedInBulk(teamName));

            endTimeCell.querySelector('.time-edit').innerHTML = '';
            endTimeCell.querySelector('.time-edit').appendChild(newEndSelect);
            endSelect = newEndSelect;

            checkIfTeamEditedInBulk(teamName);
        });

        endSelect.addEventListener('change', () => checkIfTeamEditedInBulk(teamName));
        statusSelect.addEventListener('change', () => checkIfTeamEditedInBulk(teamName));

        startTimeCell.querySelector('.time-edit').appendChild(startSelect);
        endTimeCell.querySelector('.time-edit').appendChild(endSelect);
        statusCell.querySelector('.status-edit').appendChild(statusSelect);

        row.querySelector('.action-buttons').style.display = 'none';
    });

    document.getElementById('editAllBtn').style.display = 'none';
    document.getElementById('updateAllBtn').style.display = 'inline-block';
    document.getElementById('cancelAllBtn').style.display = 'inline-block';
}

function checkIfTeamEditedInBulk(teamName) {
    const row = document.querySelector(`tr[data-team-name="${CSS.escape(teamName)}"]`);
    if (!row) return;

    const startSelect = row.querySelectorAll('.time-cell')[0].querySelector('select');
    const endSelect = row.querySelectorAll('.time-cell')[1].querySelector('select');
    const statusSelect = row.querySelector('.status-cell select');
    if (!startSelect || !endSelect || !statusSelect) return;

    const original = bulkEditOriginalValues[teamName];
    if (!original) return;

    if (startSelect.value !== original.start || endSelect.value !== original.end || statusSelect.value !== original.status) {
        row.classList.add('edited');
    } else {
        row.classList.remove('edited');
    }
}

function cancelBulkEdit() {
    bulkEditMode = false;

    Object.keys(teamsData).forEach((teamName) => {
        const row = document.querySelector(`tr[data-team-name="${CSS.escape(teamName)}"]`);
        if (!row) return;

        row.classList.remove('editing', 'bulk-editing', 'edited');
        row.querySelectorAll('.time-edit').forEach((el) => {
            el.innerHTML = '';
        });
        row.querySelector('.status-edit').innerHTML = '';
        row.querySelector('.action-buttons').style.display = 'flex';
    });

    document.getElementById('editAllBtn').style.display = 'inline-block';
    document.getElementById('updateAllBtn').style.display = 'none';
    document.getElementById('cancelAllBtn').style.display = 'none';

    bulkEditOriginalValues = {};
}

async function updateAllTeams() {
    const changedTeams = [];
    const updates = [];

    Object.keys(teamsData).forEach((teamName) => {
        const row = document.querySelector(`tr[data-team-name="${CSS.escape(teamName)}"]`);
        if (!row || !row.classList.contains('edited')) {
            return;
        }

        const startSelect = row.querySelectorAll('.time-cell')[0].querySelector('select');
        const endSelect = row.querySelectorAll('.time-cell')[1].querySelector('select');
        const statusSelect = row.querySelector('.status-cell select');

        if (!startSelect || !endSelect || !statusSelect) {
            return;
        }

        changedTeams.push({
            teamName,
            newStart: startSelect.value,
            newEnd: endSelect.value,
            newStatus: statusSelect.value
        });
    });

    if (changedTeams.length === 0) {
        alert('No changes to save');
        cancelBulkEdit();
        return;
    }

    changedTeams.forEach((changed) => {
        const team = teamsData[changed.teamName];
        updates.push(
            {
                occurrenceId: team.mainShift.id,
                startTime: changed.newStart,
                endTime: changed.newEnd,
                status: changed.newStatus
            },
            {
                occurrenceId: team.assistShift.id,
                startTime: changed.newStart,
                endTime: changed.newEnd,
                status: changed.newStatus
            }
        );
    });

    showModal('Processing Request', 'loading');

    try {
        const result = await apiRequest('/api/shifts/bulk', 'POST', { updates });

        await searchSchedule();

        if (result.summary === 'ok') {
            showModal('Shifts Updated Successfully', 'success');
            setTimeout(() => {
                hideModal();
                cancelBulkEdit();
            }, 1500);
        } else {
            showModal(`Partial Success: ${result.counts.success}/${result.counts.total}`, 'error');
            setTimeout(() => {
                hideModal();
                cancelBulkEdit();
            }, 2500);
            showError(`Bulk update completed with failures${result.requestId ? ` (requestId: ${result.requestId})` : ''}.`);
        }
    } catch (error) {
        showModal(`Update Failed: ${error.message}`, 'error');
        setTimeout(() => {
            hideModal();
        }, 3000);
        showError(`Error updating teams${getRequestIdFromError(error)}: ${error.message}`);
    }
}

function editUnmatchedShift(index) {
    const row = document.querySelector(`tr[data-unmatched-index="${index}"]`);
    const shift = unmatchedShiftsData[index];
    if (!row || !shift) return;

    row.classList.add('editing');

    const startTimeCell = row.querySelectorAll('.time-cell')[0];
    const endTimeCell = row.querySelectorAll('.time-cell')[1];
    const statusCell = row.querySelector('.status-cell');

    const startTime24 = getTimeFromDateTime(shift.dtstart);
    const endTime24 = getTimeFromDateTime(shift.dtend);

    const startSelect = createTimeSelect(startTime24);
    let endSelect = createTimeSelect(endTime24, startTime24);
    const statusSelect = createStatusSelect(shift.status);

    startSelect.addEventListener('change', () => {
        const newStartTime = startSelect.value;
        const currentEndTime = endSelect.value;

        const newEndSelect = createTimeSelect(currentEndTime, newStartTime);
        newEndSelect.addEventListener('change', () => checkIfUnmatchedEdited(index));

        endTimeCell.querySelector('.time-edit').innerHTML = '';
        endTimeCell.querySelector('.time-edit').appendChild(newEndSelect);
        endSelect = newEndSelect;

        checkIfUnmatchedEdited(index);
    });

    endSelect.addEventListener('change', () => checkIfUnmatchedEdited(index));
    statusSelect.addEventListener('change', () => checkIfUnmatchedEdited(index));

    startTimeCell.querySelector('.time-edit').appendChild(startSelect);
    endTimeCell.querySelector('.time-edit').appendChild(endSelect);
    statusCell.querySelector('.status-edit').appendChild(statusSelect);

    row.querySelector('.action-buttons').innerHTML = `
        <button class="btn-update" onclick="updateUnmatchedShift(${index})">Update</button>
        <button class="btn-cancel" onclick="cancelUnmatchedEdit(${index})">Cancel</button>
    `;
}

function checkIfUnmatchedEdited(index) {
    const row = document.querySelector(`tr[data-unmatched-index="${index}"]`);
    if (!row) return;

    const startSelect = row.querySelectorAll('.time-cell')[0].querySelector('select');
    const endSelect = row.querySelectorAll('.time-cell')[1].querySelector('select');
    const statusSelect = row.querySelector('.status-cell select');

    if (!startSelect || !endSelect || !statusSelect) return;

    const originalStart = row.dataset.originalStart;
    const originalEnd = row.dataset.originalEnd;
    const originalStatus = row.dataset.originalStatus;

    if (startSelect.value !== originalStart || endSelect.value !== originalEnd || statusSelect.value !== originalStatus) {
        row.classList.add('edited');
    } else {
        row.classList.remove('edited');
    }
}

function cancelUnmatchedEdit(index) {
    const row = document.querySelector(`tr[data-unmatched-index="${index}"]`);
    if (!row) return;

    row.classList.remove('editing');
    row.classList.remove('edited');

    row.querySelectorAll('.time-edit').forEach((el) => {
        el.innerHTML = '';
    });
    row.querySelector('.status-edit').innerHTML = '';
    row.querySelector('.action-buttons').innerHTML = `<button class="btn-edit" onclick="editUnmatchedShift(${index})">Edit</button>`;
}

async function updateUnmatchedShift(index) {
    const row = document.querySelector(`tr[data-unmatched-index="${index}"]`);
    const shift = unmatchedShiftsData[index];
    if (!row || !shift) return;

    const startSelect = row.querySelectorAll('.time-cell')[0].querySelector('select');
    const endSelect = row.querySelectorAll('.time-cell')[1].querySelector('select');
    const statusSelect = row.querySelector('.status-cell select');

    if (!startSelect || !endSelect || !statusSelect) {
        alert('Error: Selects not found');
        return;
    }

    const newStartTime = startSelect.value;
    const newEndTime = endSelect.value;
    const newStatus = statusSelect.value;

    const originalStart = row.dataset.originalStart;
    const originalEnd = row.dataset.originalEnd;
    const originalStatus = row.dataset.originalStatus;

    const timeChanged = newStartTime !== originalStart || newEndTime !== originalEnd;
    const statusChanged = newStatus !== originalStatus;

    if (!timeChanged && !statusChanged) {
        cancelUnmatchedEdit(index);
        return;
    }

    const updateBtn = row.querySelector('.btn-update');
    const cancelBtn = row.querySelector('.btn-cancel');
    updateBtn.disabled = true;
    cancelBtn.disabled = true;
    updateBtn.textContent = 'Updating...';

    try {
        const result = await apiRequest(`/api/shifts/${encodeURIComponent(shift.id)}`, 'PUT', {
            startTime: newStartTime,
            endTime: newEndTime,
            status: newStatus
        });

        const updated = result.data && result.data.updatedShift ? result.data.updatedShift : null;
        if (updated) {
            shift.dtstart = updated.dtstart;
            shift.dtend = updated.dtend;
            shift.status = updated.status;
        }

        if (timeChanged) {
            row.querySelectorAll('.time-cell')[0].querySelector('.time-display').textContent = formatTime(shift.dtstart);
            row.querySelectorAll('.time-cell')[1].querySelector('.time-display').textContent = formatTime(shift.dtend);
            row.dataset.originalStart = newStartTime;
            row.dataset.originalEnd = newEndTime;
        }

        if (statusChanged) {
            const statusClass = newStatus === 'published' ? 'published' : 'unpublished';
            const statusText = newStatus === 'published' ? 'Published' : 'Unpublished';
            row.querySelector('.status-cell .status-display').innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
            row.dataset.originalStatus = newStatus;
        }

        row.classList.remove('editing');
        row.classList.remove('edited');
        row.querySelectorAll('.time-edit').forEach((el) => {
            el.innerHTML = '';
        });
        row.querySelector('.status-edit').innerHTML = '';
        row.querySelector('.action-buttons').innerHTML = `<button class="btn-edit" onclick="editUnmatchedShift(${index})">Edit</button>`;

        row.classList.add('flash-success');
        setTimeout(() => row.classList.remove('flash-success'), 1200);

        showSuccess(`Shift updated successfully!${result.requestId ? ` requestId: ${result.requestId}` : ''}`);
    } catch (error) {
        showError(`Error updating shift${getRequestIdFromError(error)}: ${error.message}`);
        updateBtn.disabled = false;
        cancelBtn.disabled = false;
        updateBtn.textContent = 'Update';
    }
}

(function autoLoadFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const dateParam = urlParams.get('date');

    if (!dateParam) {
        return;
    }

    try {
        const parts = dateParam.split('/');
        if (parts.length !== 3) {
            return;
        }

        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        const year = parts[2];
        const isoDate = `${year}-${month}-${day}`;

        document.getElementById('dateInput').value = isoDate;

        setTimeout(() => {
            searchSchedule();
        }, 100);
    } catch {
        // Fail silently: page still works for manual search.
    }
})();

document.getElementById('dateInput').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        searchSchedule();
    }
});

window.searchSchedule = searchSchedule;
window.toggleUnmatchedShifts = toggleUnmatchedShifts;
window.editTeam = editTeam;
window.checkIfTeamEdited = checkIfTeamEdited;
window.cancelTeamEdit = cancelTeamEdit;
window.updateTeam = updateTeam;
window.enterBulkEditMode = enterBulkEditMode;
window.checkIfTeamEditedInBulk = checkIfTeamEditedInBulk;
window.cancelBulkEdit = cancelBulkEdit;
window.updateAllTeams = updateAllTeams;
window.editUnmatchedShift = editUnmatchedShift;
window.checkIfUnmatchedEdited = checkIfUnmatchedEdited;
window.cancelUnmatchedEdit = cancelUnmatchedEdit;
window.updateUnmatchedShift = updateUnmatchedShift;
