let teamsData = {};
let unmatchedShiftsData = [];
let bulkEditMode = false;
let bulkEditOriginalValues = {};

const API_BASE = window.__SCHEDULER_API_BASE__ || '';
const ERROR_REPORT_PATH = '/api/error-report';
const reportedErrorFingerprints = new Set();

function buildRequestId() {
    if (window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
    }
    return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildIdempotencyKey() {
    if (window.crypto && window.crypto.randomUUID) {
        return `idem-${window.crypto.randomUUID()}`;
    }
    return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function shouldSendIdempotencyKey(path, method) {
    const verb = String(method || 'GET').toUpperCase();
    if (verb === 'POST' && path === '/api/shifts/bulk') {
        return true;
    }
    if (verb === 'PUT' && path.startsWith('/api/shifts/')) {
        return true;
    }
    return false;
}

async function apiRequest(path, method = 'GET', body = null, options = {}) {
    const requestId = buildRequestId();
    const headers = {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId
    };

    if (options.idempotent === true || shouldSendIdempotencyKey(path, method)) {
        headers['Idempotency-Key'] = options.idempotencyKey || buildIdempotencyKey();
    }

    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
    } catch (cause) {
        const err = new Error('Network request failed');
        err.payload = {
            error: {
                code: 'NETWORK_REQUEST_FAILED',
                message: 'Network request failed'
            }
        };
        err.status = 0;
        err.cause = cause;
        throw err;
    }

    let payload = {};
    try {
        payload = await response.json();
    } catch {
        payload = {};
    }

    if (!response.ok) {
        const err = new Error(payload?.error?.message || `HTTP ${response.status}`);
        err.payload = payload;
        err.status = response.status;
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

function appendErrorMessage(additionalText) {
    const errorMessage = document.getElementById('errorMessage');
    if (!errorMessage.classList.contains('active')) {
        return;
    }
    if (errorMessage.textContent.includes(additionalText)) {
        return;
    }
    errorMessage.textContent = `${errorMessage.textContent} ${additionalText}`.trim();
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

function getHelpTail(requestId, technical = false) {
    const idPart = requestId ? ` (requestId: ${requestId})` : '';
    if (technical) {
        return ` Please contact Dev (Andrew)${idPart}.`;
    }
    return idPart ? `${idPart}.` : '';
}

function getApiErrorPayload(error) {
    return error && error.payload ? error.payload : null;
}

function sanitizeForReport(value, depth = 0) {
    if (depth > 4) {
        return '[Truncated]';
    }

    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'string') {
        return value.length > 1500 ? `${value.slice(0, 1500)}...[truncated]` : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.slice(0, 40).map((item) => sanitizeForReport(item, depth + 1));
    }

    if (typeof value === 'object') {
        const out = {};
        const entries = Object.entries(value).slice(0, 60);
        entries.forEach(([key, nested]) => {
            out[key] = sanitizeForReport(nested, depth + 1);
        });
        return out;
    }

    return String(value);
}

function collectClientSpecs() {
    return {
        url: window.location.href,
        userAgent: navigator.userAgent || null,
        language: navigator.language || null,
        platform: navigator.platform || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        screen: {
            width: window.screen?.width || null,
            height: window.screen?.height || null
        },
        viewport: {
            width: window.innerWidth || null,
            height: window.innerHeight || null
        }
    };
}

function pickFirstErrorObject(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    if (payload.error && typeof payload.error === 'object') {
        return payload.error;
    }

    if (Array.isArray(payload.results)) {
        for (const item of payload.results) {
            if (item?.error) {
                return item.error;
            }
            if (item?.failure) {
                return item.failure;
            }
            if (Array.isArray(item?.results)) {
                const nested = item.results.find((entry) => entry?.error);
                if (nested?.error) {
                    return nested.error;
                }
            }
        }
    }

    return null;
}

function getErrorContext(error) {
    const payload = getApiErrorPayload(error) || {};
    const firstError = pickFirstErrorObject(payload);
    const conflicts = Array.isArray(firstError?.conflicts) ? firstError.conflicts : [];
    return {
        requestId: payload?.requestId || null,
        code: firstError?.code || payload?.code || (error?.status === 404 ? 'ROUTE_NOT_FOUND' : null),
        message: firstError?.message || payload?.message || error?.message || null,
        conflicts
    };
}

function buildErrorFingerprint(action, userMessage, context) {
    const stable = [
        action || 'unknown_action',
        context?.code || 'unknown_code',
        context?.requestId || 'no_request_id',
        userMessage || 'no_message'
    ];
    return stable.join('|');
}

function rememberErrorFingerprint(fingerprint) {
    if (reportedErrorFingerprints.has(fingerprint)) {
        return false;
    }
    reportedErrorFingerprints.add(fingerprint);

    if (reportedErrorFingerprints.size > 200) {
        const first = reportedErrorFingerprints.values().next();
        if (!first.done) {
            reportedErrorFingerprints.delete(first.value);
        }
    }
    return true;
}

function explainErrorCode(code, details = {}) {
    const conflicts = Array.isArray(details.conflicts) ? details.conflicts : [];

    switch (code) {
        case 'INVALID_TIME_UPDATE':
        case 'INVALID_TIME_FORMAT':
        case 'INVALID_TIME_RANGE':
            return {
                message: 'The time entered is not valid. Please make sure the end time is later than the start time and try again.',
                technical: false
            };
        case 'SLING_REQUEST_FAILED':
            if (conflicts.length > 0) {
                return {
                    message: 'This update conflicts with an existing schedule item (for example approved time off). Choose a different time and try again.',
                    technical: false
                };
            }
            return {
                message: 'Sling could not accept this update right now. Try again in a moment.',
                technical: false
            };
        case 'SLING_TIMEOUT':
        case 'SLING_NETWORK_ERROR':
            return {
                message: 'Sling is not responding right now. Wait a minute and try again.',
                technical: false
            };
        case 'CASPIO_AUTH_FAILED':
        case 'CASPIO_AUTH_BAD_RESPONSE':
            return {
                message: 'The system could not sign in to Caspio right now.',
                technical: true
            };
        case 'CASPIO_REQUEST_FAILED':
            return {
                message: 'The system could not load team assignment data from Caspio right now.',
                technical: true
            };
        case 'RECURRING_REQUIRES_OCCURRENCE_ID':
        case 'INVALID_OCCURRENCE_ID':
            return {
                message: 'This shift reference is invalid for a safe update.',
                technical: true
            };
        case 'ORIGIN_NOT_ALLOWED':
            return {
                message: 'This page is not allowed to call the API.',
                technical: true
            };
        case 'INVALID_JSON':
            return {
                message: 'The request could not be processed. Please refresh and try again.',
                technical: true
            };
        case 'INVALID_DATE':
            return {
                message: 'The selected date is invalid. Please pick a valid date and try again.',
                technical: false
            };
        case 'INVALID_STATUS':
            return {
                message: 'The status value is not valid. Please choose Publish or Unpublish and try again.',
                technical: false
            };
        case 'EMPTY_UPDATE':
            return {
                message: 'No changes were detected for this row, so nothing was updated.',
                technical: false
            };
        case 'INVALID_BULK_PAYLOAD':
        case 'INVALID_GROUP_PAYLOAD':
        case 'INVALID_GROUPED_BULK_PAYLOAD':
            return {
                message: 'The update request was incomplete. Refresh the page and try again.',
                technical: true
            };
        case 'INVALID_SHIFT_DATETIME':
            return {
                message: 'This shift has invalid date or time data in Sling and cannot be updated safely.',
                technical: true
            };
        case 'SLING_RETRY_EXHAUSTED':
            return {
                message: 'Sling stayed unavailable after several retries. Wait a minute and try again.',
                technical: false
            };
        case 'CASPIO_AUTH_CONFIG_ERROR':
            return {
                message: 'Caspio credentials are missing or invalid in the API configuration.',
                technical: true
            };
        case 'ROUTE_NOT_FOUND':
            return {
                message: 'The API route was not found. This usually means the app and API deployment are out of sync.',
                technical: true
            };
        case 'NETWORK_REQUEST_FAILED':
            return {
                message: 'Could not reach the scheduling service. Check your connection and try again.',
                technical: false
            };
        default:
            return {
                message: 'Something unexpected happened while processing this request.',
                technical: true
            };
    }
}

function explainApiError(error, fallbackMessage) {
    const context = getErrorContext(error);
    const requestId = context.requestId;
    const code = context.code;
    const conflicts = context.conflicts;
    const mapped = explainErrorCode(code, { conflicts });
    const baseMessage = mapped.message || fallbackMessage || context.message || 'Something went wrong.';
    return `${baseMessage}${getHelpTail(requestId, mapped.technical)}`;
}

function summarizeGroupedFailure(response, contextLabel) {
    const requestId = response?.requestId || null;
    const failedGroups = Array.isArray(response?.results)
        ? response.results.filter((group) => group.status !== 'success')
        : [];

    if (failedGroups.length === 0) {
        return `${contextLabel} failed${getHelpTail(requestId, true)}`;
    }

    if (failedGroups.length === 1) {
        const group = failedGroups[0];
        const failureCode = group?.failure?.code || group?.results?.find((r) => r.status === 'failed')?.error?.code;
        const failureConflicts =
            group?.results?.flatMap((r) => (r.status === 'failed' ? r.error?.conflicts || [] : [])) || [];
        const mapped = explainErrorCode(failureCode, { conflicts: failureConflicts });

        if (group?.rolledBack === true) {
            return `${mapped.message} This team was safely undone, so no one in it was changed. Fix the issue and try this team again${getHelpTail(requestId, mapped.technical)}`;
        }

        return `${mapped.message} This team could not be fully undone, so times shown here may not match Sling. Stop editing now${getHelpTail(requestId, true)}`;
    }

    const rolledBackCount = failedGroups.filter((group) => group.rolledBack === true).length;
    const allRolledBack = rolledBackCount === failedGroups.length;
    if (allRolledBack) {
        return `Some teams were not updated. Failed teams were safely undone, so their Sling values were preserved. Review failed teams and retry${getHelpTail(requestId, false)}`;
    }

    return `Some teams failed and at least one could not be fully undone, so times on screen may not match Sling. Stop editing now${getHelpTail(requestId, true)}`;
}

async function reportErrorToOps({ action, userMessage, error = null, context = {} }) {
    try {
        const extracted = getErrorContext(error || {});
        const fingerprint = buildErrorFingerprint(action, userMessage, extracted);
        const shouldReport = rememberErrorFingerprint(fingerprint);
        if (!shouldReport) {
            return { delivered: false, duplicate: true };
        }

        const payload = {
            action: action || 'unknown_action',
            userMessage: userMessage || 'No user message provided.',
            occurredAt: new Date().toISOString(),
            error: {
                code: extracted.code || null,
                message: extracted.message || null,
                requestId: extracted.requestId || null,
                status: Number.isFinite(error?.status) ? error.status : null,
                details: sanitizeForReport(getApiErrorPayload(error))
            },
            context: {
                selectedDate: document.getElementById('dateInput')?.value || null,
                ...sanitizeForReport(context)
            },
            client: collectClientSpecs()
        };

        const result = await apiRequest(ERROR_REPORT_PATH, 'POST', payload);
        return {
            triggered: result?.data?.triggered === true,
            requestId: result?.requestId || null
        };
    } catch {
        return { triggered: false };
    }
}

function showErrorAndReport({ message, action, error = null, context = {} }) {
    showError(message);
    reportErrorToOps({ action, userMessage: message, error, context }).then((report) => {
        if (report.triggered) {
            appendErrorMessage('Andrew was notified via Slack.');
        }
    });
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
        const userMessage = explainApiError(error, 'Could not load the schedule for this date.');
        showErrorAndReport({
            message: userMessage,
            action: 'load_schedule',
            error,
            context: { selectedDate: dateInput.value || null }
        });
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
        const message =
            'This row could not enter edit mode correctly. Refresh and try again. If this keeps happening, contact Dev (Andrew).';
        showErrorAndReport({
            message,
            action: 'update_team_ui_state_invalid',
            context: { teamName }
        });
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

    let response = null;
    let responseError = null;

    try {
        response = await apiRequest('/api/shifts/bulk', 'POST', {
            groups: [
                {
                    groupId: teamName,
                    atomic: true,
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
                }
            ]
        });
    } catch (error) {
        responseError = error;
    }

    await searchSchedule();

    if (responseError) {
        const userMessage = explainApiError(responseError, 'Could not update this team.');
        showErrorAndReport({
            message: userMessage,
            action: 'update_team_request_failed',
            error: responseError,
            context: { teamName, startTime: newStartTime, endTime: newEndTime, status: newStatus }
        });
        return;
    }

    const groupResult = Array.isArray(response?.results) ? response.results[0] : null;
    if (response.summary === 'ok' && groupResult?.status === 'success') {
        showSuccess('Team updated successfully!');
        return;
    }

    const groupFailureMessage = summarizeGroupedFailure(response, 'Team update failed');
    showErrorAndReport({
        message: groupFailureMessage,
        action: 'update_team_atomic_failed',
        error: { payload: response, status: 200, message: 'Atomic team update failed' },
        context: { teamName, startTime: newStartTime, endTime: newEndTime, status: newStatus }
    });
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
    const groups = [];

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
        groups.push({
            groupId: changed.teamName,
            atomic: true,
            updates: [
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
            ]
        });
    });

    showModal('Processing Request', 'loading');

    try {
        const result = await apiRequest('/api/shifts/bulk', 'POST', { groups });

        await searchSchedule();

        if (result.summary === 'ok') {
            showModal('Shifts Updated Successfully', 'success');
            setTimeout(() => {
                hideModal();
                cancelBulkEdit();
            }, 1500);
        } else {
            showModal(`Some teams were not updated (${result.counts.success}/${result.counts.total} teams).`, 'error');
            setTimeout(() => {
                hideModal();
                cancelBulkEdit();
            }, 2500);
            const failureMessage = summarizeGroupedFailure(result, 'Bulk update completed with failures');
            showErrorAndReport({
                message: failureMessage,
                action: 'update_all_teams_partial_failure',
                error: { payload: result, status: 200, message: 'Bulk grouped update failed' },
                context: { teamCount: changedTeams.length }
            });
        }
    } catch (error) {
        showModal('Could not save team updates right now.', 'error');
        setTimeout(() => {
            hideModal();
        }, 3000);
        const userMessage = explainApiError(error, 'Could not update teams right now.');
        showErrorAndReport({
            message: userMessage,
            action: 'update_all_teams_request_failed',
            error,
            context: { teamCount: changedTeams.length }
        });
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
        const message =
            'This row could not enter edit mode correctly. Refresh and try again. If this keeps happening, contact Dev (Andrew).';
        showErrorAndReport({
            message,
            action: 'update_unmatched_ui_state_invalid',
            context: { unmatchedIndex: index }
        });
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
        const userMessage = explainApiError(error, 'Could not update this shift.');
        showErrorAndReport({
            message: userMessage,
            action: 'update_unmatched_shift_failed',
            error,
            context: { unmatchedIndex: index, startTime: newStartTime, endTime: newEndTime, status: newStatus }
        });
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
