import { ApiError } from '../middleware/errors.js';

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  if (!text) return null;
  return text;
}

function inferConfirmation(payload, status) {
  if (!payload) {
    return `Webhook responded with status ${status}`;
  }
  if (typeof payload === 'string') {
    return payload.trim() || `Webhook responded with status ${status}`;
  }
  if (typeof payload === 'object') {
    const textCandidate =
      payload.confirmation ||
      payload.message ||
      payload.statusText ||
      payload.status ||
      payload.result;
    if (typeof textCandidate === 'string' && textCandidate.trim()) {
      return textCandidate.trim();
    }
  }
  return `Webhook responded with status ${status}`;
}

export function createErrorReporterClient(env) {
  async function sendErrorReport(report, requestId) {
    if (!env.errorReportWebhookUrl) {
      throw new ApiError('Error reporting webhook is not configured', {
        statusCode: 503,
        code: 'ERROR_REPORTING_DISABLED'
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.requestTimeoutMs);

    try {
      const response = await fetch(env.errorReportWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(report),
        signal: controller.signal
      });

      const payload = await parseResponseBody(response);
      if (!response.ok) {
        throw new ApiError('Error report webhook call failed', {
          statusCode: 502,
          code: 'ERROR_REPORT_WEBHOOK_FAILED',
          details: {
            requestId,
            webhookStatus: response.status,
            payload
          }
        });
      }

      return {
        webhookStatus: response.status,
        payload,
        confirmation: inferConfirmation(payload, response.status)
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error?.name === 'AbortError') {
        throw new ApiError('Error report webhook timed out', {
          statusCode: 504,
          code: 'ERROR_REPORT_WEBHOOK_TIMEOUT',
          details: { requestId }
        });
      }

      throw new ApiError('Error report webhook request failed', {
        statusCode: 502,
        code: 'ERROR_REPORT_WEBHOOK_NETWORK_ERROR',
        details: {
          requestId,
          message: error?.message || String(error)
        }
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    sendErrorReport
  };
}
