import { sendError, ApiError, toApiError } from './middleware/errors.js';
import {
  buildRequestFingerprint,
  buildScopedIdempotencyKey,
  createIdempotencyStore
} from './middleware/idempotency.js';
import { createAuditStore, deriveOutcome } from './middleware/audit.js';
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

const DEFAULT_READINESS_CACHE_MS = 60 * 1000;

function isoDateToday() {
  return new Date().toISOString().slice(0, 10);
}

function resolveReadinessCacheMs(env) {
  const value = Number(env?.readinessCacheMs);
  if (Number.isFinite(value) && value >= 0) {
    return value;
  }
  return DEFAULT_READINESS_CACHE_MS;
}

function normalizeIdempotencyKey(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function toErrorPayload(requestId, error) {
  const normalized = toApiError(error);
  return {
    statusCode: normalized.statusCode,
    payload: {
      requestId,
      summary: 'failed',
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details
      }
    }
  };
}

function toIdempotencyConflictPayload({ requestId, path }) {
  return {
    statusCode: 409,
    payload: {
      requestId,
      summary: 'failed',
      error: {
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used for a different request payload',
        details: { path }
      }
    }
  };
}

function toIdempotencyInProgressPayload({ requestId, path }) {
  return {
    statusCode: 409,
    payload: {
      requestId,
      summary: 'failed',
      error: {
        code: 'IDEMPOTENCY_IN_PROGRESS',
        message: 'A request with this idempotency key is still being processed',
        details: { path }
      }
    }
  };
}

function fireAuditLog(auditStorePromise, { requestId, idempotencyKey, method, path, body, statusCode, payload, startedAt }) {
  const durationMs = Date.now() - startedAt;
  auditStorePromise.then((store) =>
    store.record({
      requestId,
      idempotencyKey: idempotencyKey || null,
      method,
      path,
      body,
      statusCode,
      payload,
      durationMs,
      outcome: deriveOutcome(statusCode, payload)
    })
  ).catch((err) => {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'audit_write_failed',
        requestId,
        idempotencyKey: idempotencyKey || null,
        method,
        path,
        body,
        statusCode,
        payload,
        durationMs,
        outcome: deriveOutcome(statusCode, payload),
        auditError: err?.message || String(err)
      })
    );
  });
}

async function executeIdempotentWrite({
  idempotencyStorePromise,
  idempotencyKey,
  method,
  path,
  body,
  requestId,
  execute
}) {
  if (!idempotencyKey) {
    return execute();
  }

  const store = await idempotencyStorePromise;
  const scopedKey = buildScopedIdempotencyKey({ method, path, idempotencyKey });
  const fingerprint = buildRequestFingerprint({ method, path, body });
  const reservation = await store.reserve({
    scopedKey,
    fingerprint,
    requestId
  });

  if (reservation.status === 'replay') {
    if (!Number.isInteger(reservation.statusCode) || reservation.payload === undefined) {
      throw new ApiError('Stored idempotency response is invalid', {
        statusCode: 500,
        code: 'IDEMPOTENCY_REPLAY_INVALID'
      });
    }
    return {
      statusCode: reservation.statusCode,
      payload: reservation.payload
    };
  }

  if (reservation.status === 'conflict') {
    return toIdempotencyConflictPayload({ requestId, path });
  }

  if (reservation.status === 'in_progress') {
    return toIdempotencyInProgressPayload({ requestId, path });
  }

  const response = await execute();
  await store.complete({
    scopedKey,
    fingerprint,
    statusCode: response.statusCode,
    payload: response.payload,
    requestId
  });

  return response;
}

async function runReadinessCheck(name, fn) {
  const startedAt = Date.now();
  try {
    await fn();
    return {
      status: 'ok',
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      status: 'degraded',
      durationMs: Date.now() - startedAt,
      code: error?.code || `${name.toUpperCase()}_UNAVAILABLE`,
      message: error?.message || `${name} readiness check failed`
    };
  }
}

async function buildReadinessResult({ env, slingClient, caspioClient, requestId }) {
  const today = isoDateToday();
  const slingUserId = env.slingManagerUserId;

  const [slingCheck, caspioCheck] = await Promise.all([
    runReadinessCheck('sling', async () => {
      if (typeof slingClient?.getUsersByIds !== 'function') {
        throw new ApiError('Sling readiness check is not configured', {
          statusCode: 503,
          code: 'SLING_READINESS_UNAVAILABLE'
        });
      }
      await slingClient.getUsersByIds([slingUserId], requestId);
    }),
    runReadinessCheck('caspio', async () => {
      if (typeof caspioClient?.getTeamAssignmentsByDate !== 'function') {
        throw new ApiError('Caspio readiness check is not configured', {
          statusCode: 503,
          code: 'CASPIO_READINESS_UNAVAILABLE'
        });
      }
      await caspioClient.getTeamAssignmentsByDate(today, requestId);
    })
  ]);

  const checks = {
    sling: slingCheck,
    caspio: caspioCheck
  };

  const summary = Object.values(checks).every((check) => check.status === 'ok') ? 'ok' : 'degraded';
  return {
    statusCode: summary === 'ok' ? 200 : 503,
    summary,
    checks,
    checkedAt: new Date().toISOString(),
    requestId
  };
}

export function createRequestHandler({
  env,
  slingClient,
  caspioClient,
  errorReporterClient = null,
  idempotencyStore = null,
  auditStore = null
}) {
  const readinessCache = {
    expiresAt: 0,
    result: null
  };
  const readinessCacheMs = resolveReadinessCacheMs(env);
  const serviceName = env?.serviceName || 'sling-scheduling';
  const idempotencyStorePromise = idempotencyStore
    ? Promise.resolve(idempotencyStore)
    : createIdempotencyStore(env);
  const auditStorePromise = auditStore
    ? Promise.resolve(auditStore)
    : createAuditStore(env);

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
            service: serviceName,
            timezone: env.timezone
          },
          baseHeaders
        );
        return;
      }

      if (req.method === 'GET' && path === '/readyz') {
        const forceRefresh = query.get('refresh') === '1' || query.get('force') === '1';
        const isCacheValid =
          !forceRefresh &&
          readinessCache.result &&
          readinessCache.expiresAt > Date.now();

        let readiness = readinessCache.result;
        let cached = false;

        if (isCacheValid) {
          cached = true;
        } else {
          readiness = await buildReadinessResult({
            env,
            slingClient,
            caspioClient,
            requestId
          });
          readinessCache.result = readiness;
          readinessCache.expiresAt = Date.now() + readinessCacheMs;
        }

        sendJson(
          res,
          readiness.statusCode,
          {
            requestId,
            summary: readiness.summary,
            service: serviceName,
            checks: readiness.checks,
            checkedAt: readiness.checkedAt,
            cached
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
        const startedAt = Date.now();
        const encodedId = path.replace('/api/shifts/', '');
        const occurrenceId = decodeURIComponent(encodedId);
        const body = (await readRequestBodySafely(req, requestId)) || {};
        const idempotencyKey = normalizeIdempotencyKey(req.headers['idempotency-key']);
        const result = await executeIdempotentWrite({
          idempotencyStorePromise,
          idempotencyKey,
          method: req.method,
          path,
          body,
          requestId,
          execute: async () => {
            try {
              const payload = await updateSingleOccurrence({
                occurrenceId,
                payload: body,
                slingClient,
                env,
                requestId
              });
              return { statusCode: 200, payload };
            } catch (error) {
              if (error instanceof ApiError) {
                return {
                  statusCode: error.statusCode || 400,
                  payload: normalizeSingleUpdateError(occurrenceId, error, requestId)
                };
              }
              throw error;
            }
          }
        });
        sendJson(res, result.statusCode, result.payload, baseHeaders);
        fireAuditLog(auditStorePromise, {
          requestId, idempotencyKey, method: req.method, path, body,
          statusCode: result.statusCode, payload: result.payload, startedAt
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/shifts/bulk') {
        const startedAt = Date.now();
        const body = (await readRequestBodySafely(req, requestId)) || {};
        const idempotencyKey = normalizeIdempotencyKey(req.headers['idempotency-key']);
        const result = await executeIdempotentWrite({
          idempotencyStorePromise,
          idempotencyKey,
          method: req.method,
          path,
          body,
          requestId,
          execute: async () => {
            try {
              const payload = await updateBulkOccurrences({
                payload: body,
                slingClient,
                env,
                requestId
              });
              const statusCode = payload.summary === 'failed' && payload.mode === 'flat' ? 409 : 200;
              return { statusCode, payload };
            } catch (error) {
              if (error instanceof ApiError) {
                return toErrorPayload(requestId, error);
              }
              throw error;
            }
          }
        });
        sendJson(res, result.statusCode, result.payload, baseHeaders);
        fireAuditLog(auditStorePromise, {
          requestId, idempotencyKey, method: req.method, path, body,
          statusCode: result.statusCode, payload: result.payload, startedAt
        });
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
            service: serviceName,
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
              triggered: delivered?.triggered === true,
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
      if (!res.headersSent) {
        sendError(res, requestId, error, baseHeaders);
      } else {
        res.destroy();
      }
    }
  };
}
