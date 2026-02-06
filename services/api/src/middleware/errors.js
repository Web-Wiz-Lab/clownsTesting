import { sendJson } from '../utils/http.js';

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = options.statusCode || 500;
    this.code = options.code || 'INTERNAL_ERROR';
    this.details = options.details || null;
  }
}

export function toApiError(error) {
  if (error instanceof ApiError) {
    return error;
  }

  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const code = error?.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
  const message = error?.message || 'Unexpected error';
  return new ApiError(message, { statusCode, code, details: error?.details || null });
}

export function sendError(res, requestId, error, extraHeaders = {}) {
  const normalized = toApiError(error);
  sendJson(
    res,
    normalized.statusCode,
    {
      requestId,
      summary: 'failed',
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details
      }
    },
    extraHeaders
  );
}
