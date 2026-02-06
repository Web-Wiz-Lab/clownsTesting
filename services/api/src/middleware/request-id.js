import crypto from 'node:crypto';

export function buildRequestContext(req) {
  const incoming = req.headers['x-request-id'];
  const requestId = incoming && typeof incoming === 'string' ? incoming : crypto.randomUUID();
  return { requestId };
}
