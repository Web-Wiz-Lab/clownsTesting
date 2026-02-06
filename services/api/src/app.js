import { sendError, ApiError } from './middleware/errors.js';
import { readIdempotentResult, storeIdempotentResult } from './middleware/idempotency.js';
import { buildRequestContext } from './middleware/request-id.js';
import { getPathAndQuery, readRequestBodySafely, sendJson } from './utils/http.js';
import { handleGetSchedule } from './routes/schedule.js';
import {
  normalizeSingleUpdateError,
  updateBulkOccurrences,
  updateSingleOccurrence
} from './routes/updates.js';

function evaluateOrigin(origin, env) {
  const allowed = env.corsAllowedOrigins || [];
  const allowAllInDev = env.nodeEnv !== 'production' && allowed.length === 0;

  if (!origin) {
    return {
      allowed: true,
      headerValue: allowAllInDev ? '*' : (allowed[0] || '*')
    };
  }

  if (allowAllInDev || allowed.includes(origin)) {
    return { allowed: true, headerValue: origin };
  }

  return { allowed: false, headerValue: 'null' };
}

function corsHeaders(originState, requestId) {
  return {
    'Access-Control-Allow-Origin': originState.headerValue,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Request-Id,Idempotency-Key',
    'Access-Control-Max-Age': '3600',
    Vary: 'Origin',
    'X-Request-Id': requestId
  };
}

export function createRequestHandler({ env, slingClient, caspioClient, errorReporterClient = null }) {
  return async function routeRequest(req, res) {
    const { requestId } = buildRequestContext(req);
    const origin = req.headers.origin || '';
    const originState = evaluateOrigin(origin, env);
    const baseHeaders = corsHeaders(originState, requestId);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, baseHeaders);
      res.end();
      return;
    }

    try {
      if (origin && !originState.allowed) {
        throw new ApiError('Origin is not allowed by CORS policy', {
          statusCode: 403,
          code: 'ORIGIN_NOT_ALLOWED',
          details: { origin }
        });
      }

      const { path, query } = getPathAndQuery(req.url);

      if (req.method === 'GET' && path === '/healthz') {
        sendJson(
          res,
          200,
          {
            requestId,
            summary: 'ok',
            service: 'sling-scheduler-api',
            timezone: env.timezone
          },
          baseHeaders
        );
        return;
      }

      if (req.method === 'GET' && path === '/api/schedule') {
        const date = query.get('date');
        const payload = await handleGetSchedule({
          env,
          slingClient,
          caspioClient,
          requestId,
          dateIso: date
        });
        sendJson(res, 200, payload, baseHeaders);
        return;
      }

      if (req.method === 'PUT' && path.startsWith('/api/shifts/')) {
        const encodedId = path.replace('/api/shifts/', '');
        const occurrenceId = decodeURIComponent(encodedId);
        const body = (await readRequestBodySafely(req, requestId)) || {};

        try {
          const payload = await updateSingleOccurrence({
            occurrenceId,
            payload: body,
            slingClient,
            env,
            requestId
          });
          sendJson(res, 200, payload, baseHeaders);
        } catch (error) {
          if (error instanceof ApiError) {
            const normalized = normalizeSingleUpdateError(occurrenceId, error, requestId);
            sendJson(res, error.statusCode || 400, normalized, baseHeaders);
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/shifts/bulk') {
        const idempotencyKey = req.headers['idempotency-key'];
        if (typeof idempotencyKey === 'string') {
          const cached = readIdempotentResult(idempotencyKey);
          if (cached) {
            sendJson(res, cached.statusCode, cached.payload, baseHeaders);
            return;
          }
        }

        const body = (await readRequestBodySafely(req, requestId)) || {};
        const payload = await updateBulkOccurrences({
          payload: body,
          slingClient,
          env,
          requestId
        });

        const statusCode = payload.summary === 'failed' && payload.mode === 'flat' ? 409 : 200;
        if (typeof idempotencyKey === 'string') {
          storeIdempotentResult(idempotencyKey, { statusCode, payload });
        }
        sendJson(res, statusCode, payload, baseHeaders);
        return;
      }

      if (req.method === 'POST' && path === '/api/error-report') {
        const body = (await readRequestBodySafely(req, requestId)) || {};
        if (!errorReporterClient?.sendErrorReport) {
          throw new ApiError('Error reporting is not configured', {
            statusCode: 503,
            code: 'ERROR_REPORTING_DISABLED'
          });
        }

        const report = {
          source: 'sling-scheduler-ui',
          reportRequestId: requestId,
          receivedAt: new Date().toISOString(),
          server: {
            service: 'sling-scheduler-api',
            method: req.method,
            path,
            origin: req.headers.origin || null,
            userAgent: req.headers['user-agent'] || null
          },
          event: body
        };

        const delivered = await errorReporterClient.sendErrorReport(report, requestId);
        sendJson(
          res,
          200,
          {
            requestId,
            summary: 'ok',
            data: {
              delivered: true,
              confirmation: delivered?.confirmation || null,
              webhookStatus: delivered?.webhookStatus || null
            }
          },
          baseHeaders
        );
        return;
      }

      throw new ApiError('Route not found', {
        statusCode: 404,
        code: 'ROUTE_NOT_FOUND',
        details: { method: req.method, path }
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'request_failed',
          requestId,
          method: req.method,
          path: req.url,
          error: {
            code: error?.code,
            message: error?.message,
            details: error?.details || null
          }
        })
      );
      sendError(res, requestId, error, baseHeaders);
    }
  };
}
