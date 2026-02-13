import { apiRequest } from './api';

const ERROR_REPORT_PATH = '/api/error-report';
const reportedErrorFingerprints = new Set<string>();

export interface ErrorExplanation {
  message: string;
  technical: boolean;
}

export interface ErrorContext {
  requestId: string | null;
  code: string | null;
  message: string | null;
  conflicts: any[];
}

function getHelpTail(requestId: string | null, technical: boolean = false): string {
  const idPart = requestId ? ` (requestId: ${requestId})` : '';
  if (technical) {
    return ` Please contact Dev (Andrew)${idPart}.`;
  }
  return idPart ? `${idPart}.` : '';
}

function getApiErrorPayload(error: any): any | null {
  return error && error.payload ? error.payload : null;
}

function sanitizeForReport(value: any, depth: number = 0): any {
  if (depth > 7) {
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
    const out: Record<string, any> = {};
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
      height: window.screen?.height || null,
    },
    viewport: {
      width: window.innerWidth || null,
      height: window.innerHeight || null,
    },
  };
}

function pickFirstErrorObject(payload: any): any | null {
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
        const nested = item.results.find((entry: any) => entry?.error);
        if (nested?.error) {
          return nested.error;
        }
      }
    }
  }

  return null;
}

export function getErrorContext(error: any): ErrorContext {
  const payload = getApiErrorPayload(error) || {};
  const firstError = pickFirstErrorObject(payload);
  const conflicts = Array.isArray(firstError?.conflicts) ? firstError.conflicts : [];
  return {
    requestId: payload?.requestId || null,
    code:
      firstError?.code ||
      payload?.code ||
      (error?.status === 404 ? 'ROUTE_NOT_FOUND' : null),
    message: firstError?.message || payload?.message || error?.message || null,
    conflicts,
  };
}

function buildErrorFingerprint(
  action: string,
  userMessage: string,
  context: ErrorContext
): string {
  const stable = [
    action || 'unknown_action',
    context?.code || 'unknown_code',
    context?.requestId || 'no_request_id',
    userMessage || 'no_message',
  ];
  return stable.join('|');
}

function rememberErrorFingerprint(fingerprint: string): boolean {
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

export function explainErrorCode(
  code: string | null,
  details: { conflicts?: any[] } = {}
): ErrorExplanation {
  const conflicts = Array.isArray(details.conflicts) ? details.conflicts : [];

  switch (code) {
    case 'INVALID_TIME_UPDATE':
    case 'INVALID_TIME_FORMAT':
    case 'INVALID_TIME_RANGE':
      return {
        message:
          'The time entered is not valid. Please make sure the end time is later than the start time and try again.',
        technical: false,
      };
    case 'SLING_REQUEST_FAILED':
      if (conflicts.length > 0) {
        return {
          message:
            'This update conflicts with an existing schedule item (for example approved time off). Choose a different time and try again.',
          technical: false,
        };
      }
      return {
        message: 'Sling could not accept this update right now. Try again in a moment.',
        technical: false,
      };
    case 'SLING_TIMEOUT':
    case 'SLING_NETWORK_ERROR':
      return {
        message: 'Sling is not responding right now. Wait a minute and try again.',
        technical: false,
      };
    case 'CASPIO_AUTH_FAILED':
    case 'CASPIO_AUTH_BAD_RESPONSE':
      return {
        message: 'The system could not sign in to Caspio right now.',
        technical: true,
      };
    case 'CASPIO_REQUEST_FAILED':
      return {
        message: 'The system could not load team assignment data from Caspio right now.',
        technical: true,
      };
    case 'RECURRING_REQUIRES_OCCURRENCE_ID':
    case 'INVALID_OCCURRENCE_ID':
      return {
        message: 'This shift reference is invalid for a safe update.',
        technical: true,
      };
    case 'ORIGIN_NOT_ALLOWED':
      return {
        message: 'This page is not allowed to call the API.',
        technical: true,
      };
    case 'INVALID_JSON':
      return {
        message: 'The request could not be processed. Please refresh and try again.',
        technical: true,
      };
    case 'INVALID_DATE':
      return {
        message: 'The selected date is invalid. Please pick a valid date and try again.',
        technical: false,
      };
    case 'INVALID_STATUS':
      return {
        message:
          'The status value is not valid. Please choose Publish or Unpublish and try again.',
        technical: false,
      };
    case 'EMPTY_UPDATE':
      return {
        message: 'No changes were detected for this row, so nothing was updated.',
        technical: false,
      };
    case 'INVALID_BULK_PAYLOAD':
    case 'INVALID_GROUP_PAYLOAD':
    case 'INVALID_GROUPED_BULK_PAYLOAD':
      return {
        message: 'The update request was incomplete. Refresh the page and try again.',
        technical: true,
      };
    case 'IDEMPOTENCY_KEY_REUSED':
      return {
        message:
          'This update key was already used for a different change. Retry the action from a fresh click.',
        technical: false,
      };
    case 'IDEMPOTENCY_IN_PROGRESS':
      return {
        message: 'This update is still processing. Please wait a moment before trying again.',
        technical: false,
      };
    case 'INVALID_SHIFT_DATETIME':
      return {
        message:
          'This shift has invalid date or time data in Sling and cannot be updated safely.',
        technical: true,
      };
    case 'SLING_RETRY_EXHAUSTED':
      return {
        message: 'Sling stayed unavailable after several retries. Wait a minute and try again.',
        technical: false,
      };
    case 'CASPIO_AUTH_CONFIG_ERROR':
      return {
        message: 'Caspio credentials are missing or invalid in the API configuration.',
        technical: true,
      };
    case 'ROUTE_NOT_FOUND':
      return {
        message:
          'The API route was not found. This usually means the app and API deployment are out of sync.',
        technical: true,
      };
    case 'NETWORK_REQUEST_FAILED':
      return {
        message: 'Could not reach the scheduling service. Check your connection and try again.',
        technical: false,
      };
    default:
      return {
        message: 'Something unexpected happened while processing this request.',
        technical: true,
      };
  }
}

export function explainApiError(error: any, fallbackMessage: string): string {
  const context = getErrorContext(error);
  const requestId = context.requestId;
  const code = context.code;
  const conflicts = context.conflicts;
  const mapped = explainErrorCode(code, { conflicts });
  const baseMessage =
    mapped.message || fallbackMessage || context.message || 'Something went wrong.';
  return `${baseMessage}${getHelpTail(requestId, mapped.technical)}`;
}

export function summarizeGroupedFailure(response: any, contextLabel: string): string {
  const requestId = response?.requestId || null;
  const failedGroups = Array.isArray(response?.results)
    ? response.results.filter((group: any) => group.status !== 'success')
    : [];

  if (failedGroups.length === 0) {
    return `${contextLabel} failed${getHelpTail(requestId, true)}`;
  }

  if (failedGroups.length === 1) {
    const group = failedGroups[0];
    const failureCode =
      group?.failure?.code || group?.results?.find((r: any) => r.status === 'failed')?.error?.code;
    const failureConflicts =
      group?.results?.flatMap((r: any) =>
        r.status === 'failed' ? r.error?.conflicts || [] : []
      ) || [];
    const mapped = explainErrorCode(failureCode, { conflicts: failureConflicts });

    if (group?.rolledBack === true) {
      return `${mapped.message} This team was safely undone, so no one in it was changed. Fix the issue and try this team again${getHelpTail(requestId, mapped.technical)}`;
    }

    return `${mapped.message} This team could not be fully undone, so times shown here may not match Sling. Stop editing now${getHelpTail(requestId, true)}`;
  }

  const rolledBackCount = failedGroups.filter((group: any) => group.rolledBack === true).length;
  const allRolledBack = rolledBackCount === failedGroups.length;
  if (allRolledBack) {
    return `Some teams were not updated. Failed teams were safely undone, so their Sling values were preserved. Review failed teams and retry${getHelpTail(requestId, false)}`;
  }

  return `Some teams failed and at least one could not be fully undone, so times on screen may not match Sling. Stop editing now${getHelpTail(requestId, true)}`;
}

export interface ErrorReportParams {
  action: string;
  userMessage: string;
  error?: any;
  context?: Record<string, any>;
}

export interface ErrorReportResult {
  triggered?: boolean;
  delivered?: boolean;
  duplicate?: boolean;
  requestId?: string | null;
}

export async function reportErrorToOps({
  action,
  userMessage,
  error = null,
  context = {},
}: ErrorReportParams): Promise<ErrorReportResult> {
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
        details: sanitizeForReport(getApiErrorPayload(error)),
      },
      context: sanitizeForReport(context),
      client: collectClientSpecs(),
    };

    const result = await apiRequest(ERROR_REPORT_PATH, 'POST', payload);
    const triggered = result?.data?.triggered === true;

    if (triggered) {
      try {
        localStorage.setItem(
          'changelog_investigating',
          JSON.stringify({
            investigating: true,
            timestamp: new Date().toISOString(),
          })
        );
      } catch {
        // localStorage may be unavailable (private browsing, storage full)
      }
    }

    return {
      triggered,
      requestId: result?.requestId || null,
    };
  } catch {
    return { triggered: false };
  }
}

export function getInvestigatingFlag(): {
  investigating: boolean;
  timestamp: string;
} | null {
  try {
    const raw = localStorage.getItem('changelog_investigating');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.investigating === 'boolean' &&
      typeof parsed.timestamp === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearInvestigatingFlag(): void {
  try {
    localStorage.removeItem('changelog_investigating');
  } catch {
    // localStorage may be unavailable
  }
}
