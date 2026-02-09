import { createHash } from 'node:crypto';

const DEFAULT_COMPLETED_TTL_SECONDS = 10 * 60;
const DEFAULT_PENDING_TTL_SECONDS = 120;
const DEFAULT_COLLECTION = 'idempotency_records';

function nowMs() {
  return Date.now();
}

function intOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stableStringify(value) {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(String(value));
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function buildScopedIdempotencyKey({ method, path, idempotencyKey }) {
  return `${String(method || 'GET').toUpperCase()}:${path}:${idempotencyKey}`;
}

export function buildRequestFingerprint({ method, path, body }) {
  const bodyHash = hashText(stableStringify(body));
  return hashText(`${String(method || 'GET').toUpperCase()}|${path}|${bodyHash}`);
}

function isExpired(expiresAtMs) {
  return expiresAtMs <= nowMs();
}

function createMemoryIdempotencyStore({ completedTtlSeconds, pendingTtlSeconds }) {
  const cache = new Map();
  const completedTtlMs = completedTtlSeconds * 1000;
  const pendingTtlMs = pendingTtlSeconds * 1000;

  function cleanup() {
    const current = nowMs();
    for (const [key, value] of cache.entries()) {
      if (value.expiresAtMs <= current) {
        cache.delete(key);
      }
    }
  }

  return {
    async reserve({ scopedKey, fingerprint, requestId }) {
      cleanup();
      const existing = cache.get(scopedKey);

      if (!existing || isExpired(existing.expiresAtMs)) {
        cache.set(scopedKey, {
          status: 'PENDING',
          fingerprint,
          requestId,
          expiresAtMs: nowMs() + pendingTtlMs
        });
        return { status: 'reserved' };
      }

      if (existing.fingerprint !== fingerprint) {
        return { status: 'conflict' };
      }

      if (existing.status === 'COMPLETED') {
        return {
          status: 'replay',
          statusCode: existing.statusCode,
          payload: existing.payload
        };
      }

      return { status: 'in_progress' };
    },
    async complete({ scopedKey, fingerprint, statusCode, payload, requestId }) {
      cleanup();
      const existing = cache.get(scopedKey);

      if (existing && existing.fingerprint !== fingerprint && !isExpired(existing.expiresAtMs)) {
        return { status: 'conflict' };
      }

      cache.set(scopedKey, {
        status: 'COMPLETED',
        fingerprint,
        requestId,
        statusCode,
        payload,
        expiresAtMs: nowMs() + completedTtlMs
      });

      return { status: 'completed' };
    }
  };
}

function timestampToMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function createFirestoreIdempotencyStore({
  projectId,
  databaseId,
  collection,
  completedTtlSeconds,
  pendingTtlSeconds
}) {
  const module = await import('@google-cloud/firestore');
  const Firestore = module.Firestore || module.default?.Firestore;

  if (!Firestore) {
    throw new Error('Firestore SDK is unavailable for idempotency backend');
  }

  const firestoreOptions = {};
  if (projectId) {
    firestoreOptions.projectId = projectId;
  }
  if (databaseId) {
    firestoreOptions.databaseId = databaseId;
  }
  const db =
    Object.keys(firestoreOptions).length > 0
      ? new Firestore(firestoreOptions)
      : new Firestore();
  const ref = db.collection(collection);

  return {
    async reserve({ scopedKey, fingerprint, requestId }) {
      const docId = hashText(scopedKey);
      const docRef = ref.doc(docId);
      const currentMs = nowMs();

      const result = await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(docRef);
        const existing = snapshot.exists ? snapshot.data() : null;
        const existingExpiry = timestampToMs(existing?.expiresAt);
        const expired = !existing || existingExpiry <= currentMs;

        if (expired) {
          tx.set(docRef, {
            scopedKey,
            fingerprint,
            status: 'PENDING',
            requestId,
            createdAt: new Date(currentMs),
            updatedAt: new Date(currentMs),
            expiresAt: new Date(currentMs + pendingTtlSeconds * 1000)
          });
          return { status: 'reserved' };
        }

        if (existing.fingerprint !== fingerprint) {
          return { status: 'conflict' };
        }

        if (existing.status === 'COMPLETED') {
          return {
            status: 'replay',
            statusCode: existing.responseStatusCode,
            payload: existing.responsePayload
          };
        }

        return { status: 'in_progress' };
      });

      return result;
    },
    async complete({ scopedKey, fingerprint, statusCode, payload, requestId }) {
      const docId = hashText(scopedKey);
      const docRef = ref.doc(docId);
      const currentMs = nowMs();

      const result = await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(docRef);
        const existing = snapshot.exists ? snapshot.data() : null;
        const existingExpiry = timestampToMs(existing?.expiresAt);
        const expired = !existing || existingExpiry <= currentMs;

        if (!expired && existing?.fingerprint !== fingerprint) {
          return { status: 'conflict' };
        }

        tx.set(
          docRef,
          {
            scopedKey,
            fingerprint,
            status: 'COMPLETED',
            requestId,
            responseStatusCode: statusCode,
            responsePayload: payload,
            updatedAt: new Date(currentMs),
            expiresAt: new Date(currentMs + completedTtlSeconds * 1000)
          },
          { merge: true }
        );
        return { status: 'completed' };
      });

      return result;
    }
  };
}

export async function createIdempotencyStore(env = {}) {
  const backend = String(env.idempotencyBackend || 'memory').toLowerCase();
  const completedTtlSeconds = intOrDefault(
    env.idempotencyTtlSeconds,
    DEFAULT_COMPLETED_TTL_SECONDS
  );
  const pendingTtlSeconds = intOrDefault(
    env.idempotencyPendingTtlSeconds,
    DEFAULT_PENDING_TTL_SECONDS
  );

  if (backend === 'firestore') {
    return createFirestoreIdempotencyStore({
      projectId: env.idempotencyProjectId || '',
      databaseId: env.idempotencyDatabaseId || '',
      collection: env.idempotencyCollection || DEFAULT_COLLECTION,
      completedTtlSeconds,
      pendingTtlSeconds
    });
  }

  return createMemoryIdempotencyStore({
    completedTtlSeconds,
    pendingTtlSeconds
  });
}
