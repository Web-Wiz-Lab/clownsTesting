const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

function now() {
  return Date.now();
}

function cleanup() {
  const current = now();
  for (const [key, value] of cache.entries()) {
    if (value.expiresAt <= current) {
      cache.delete(key);
    }
  }
}

export function readIdempotentResult(key) {
  if (!key) return null;
  cleanup();
  const entry = cache.get(key);
  return entry ? entry.payload : null;
}

export function storeIdempotentResult(key, payload) {
  if (!key) return;
  cleanup();
  cache.set(key, {
    payload,
    expiresAt: now() + CACHE_TTL_MS
  });
}
