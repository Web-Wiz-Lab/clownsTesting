import { ApiError } from '../middleware/errors.js';

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

      if (!response.ok) {
        throw new ApiError('Error report webhook call failed', {
          statusCode: 502,
          code: 'ERROR_REPORT_WEBHOOK_FAILED',
          details: {
            requestId,
            webhookStatus: response.status
          }
        });
      }

      return {
        triggered: true,
        webhookStatus: response.status
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
