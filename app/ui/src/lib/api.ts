const DEFAULT_API_BASE = 'https://sling-scheduling-89502226654.us-east1.run.app';

function resolveApiBase(): string {
  const envBase = import.meta.env.VITE_API_BASE_URL || '';
  const runtimeBase =
    typeof window !== 'undefined'
      ? (window as unknown as { __SCHEDULER_API_BASE__?: string }).__SCHEDULER_API_BASE__ || ''
      : '';

  const value = envBase || runtimeBase || DEFAULT_API_BASE;
  return value.replace(/\/+$/, '');
}

const API_BASE = resolveApiBase();

export function buildRequestId(): string {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildIdempotencyKey(): string {
  if (window.crypto && window.crypto.randomUUID) {
    return `idem-${window.crypto.randomUUID()}`;
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function shouldSendIdempotencyKey(path: string, method: string): boolean {
  const verb = String(method || 'GET').toUpperCase();
  if (verb === 'POST' && path === '/api/shifts/bulk') {
    return true;
  }
  if (verb === 'PUT' && path.startsWith('/api/shifts/')) {
    return true;
  }
  return false;
}

export interface ApiRequestOptions {
  idempotent?: boolean;
  idempotencyKey?: string;
}

export interface ApiError extends Error {
  payload?: any;
  status?: number;
  cause?: any;
}

export async function apiRequest<T = any>(
  path: string,
  method: string = 'GET',
  body: any = null,
  options: ApiRequestOptions = {}
): Promise<T> {
  const requestId = buildRequestId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
  };

  if (options.idempotent === true || shouldSendIdempotencyKey(path, method)) {
    headers['Idempotency-Key'] = options.idempotencyKey || buildIdempotencyKey();
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    const err: ApiError = new Error('Network request failed');
    err.payload = {
      error: {
        code: 'NETWORK_REQUEST_FAILED',
        message: 'Network request failed',
      },
    };
    err.status = 0;
    err.cause = cause;
    throw err;
  }

  let payload: any = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const err: ApiError = new Error(
      payload?.error?.message || `HTTP ${response.status}`
    );
    err.payload = payload;
    err.status = response.status;
    throw err;
  }

  return payload as T;
}
