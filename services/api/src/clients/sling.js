import { ApiError } from '../middleware/errors.js';

function isTransientStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createSlingClient(env) {
  const baseHeaders = {
    Accept: '*/*',
    Authorization: env.slingApiToken,
    'Content-Type': 'application/json'
  };

  async function request({ method = 'GET', path, body, requestId, retryAttempts }) {
    const url = path.startsWith('http') ? path : `${env.slingBaseUrl}${path}`;
    const attempts = Number.isInteger(retryAttempts) ? retryAttempts : env.retryAttempts;

    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), env.requestTimeoutMs);
      const startedAt = Date.now();

      try {
        const response = await fetch(url, {
          method,
          headers: baseHeaders,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal
        });

        const durationMs = Date.now() - startedAt;
        const payload = await parseResponseBody(response);

        if (!response.ok) {
          if (isTransientStatus(response.status) && attempt < attempts) {
            await delay(250 * (attempt + 1));
            continue;
          }

          throw new ApiError('Sling request failed', {
            statusCode: response.status,
            code: 'SLING_REQUEST_FAILED',
            details: {
              requestId,
              method,
              url,
              status: response.status,
              durationMs,
              payload
            }
          });
        }

        console.log(
          JSON.stringify({
            level: 'info',
            msg: 'sling_request_ok',
            requestId,
            method,
            url,
            status: response.status,
            durationMs
          })
        );

        return payload;
      } catch (error) {
        const isAbortError = error?.name === 'AbortError';
        if ((isAbortError || error?.statusCode >= 500) && attempt < attempts) {
          await delay(250 * (attempt + 1));
          continue;
        }

        if (isAbortError) {
          throw new ApiError('Sling request timed out', {
            statusCode: 504,
            code: 'SLING_TIMEOUT',
            details: { requestId, method, url }
          });
        }

        if (error instanceof ApiError) {
          throw error;
        }

        throw new ApiError('Sling request crashed', {
          statusCode: 502,
          code: 'SLING_NETWORK_ERROR',
          details: {
            requestId,
            method,
            url,
            message: error?.message || String(error)
          }
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new ApiError('Sling retry budget exhausted', {
      statusCode: 502,
      code: 'SLING_RETRY_EXHAUSTED',
      details: { requestId, method, url }
    });
  }

  return {
    request,
    getShiftById(occurrenceId, requestId) {
      return request({ method: 'GET', path: `/v1/shifts/${encodeURIComponent(occurrenceId)}`, requestId });
    },
    updateShift(occurrenceId, payload, requestId) {
      return request({
        method: 'PUT',
        path: `/v1/shifts/${encodeURIComponent(occurrenceId)}`,
        body: payload,
        requestId
      });
    },
    getCalendarShifts(dateIso, requestId) {
      const dates = `${dateIso}/${dateIso}`;
      return request({
        method: 'GET',
        path: `/v1/calendar/${env.slingCalendarId}/users/${env.slingManagerUserId}?dates=${encodeURIComponent(dates)}`,
        requestId
      });
    },
    getUsersByIds(ids, requestId) {
      if (!ids.length) return Promise.resolve([]);
      const joined = ids.join(',');
      return request({ method: 'GET', path: `/v1/users?ids=${encodeURIComponent(joined)}`, requestId });
    }
  };
}
