const DEFAULT_AUDIT_COLLECTION = 'audit_log';

export function deriveOutcome(statusCode, payload) {
  if (statusCode !== 200) {
    return 'failure';
  }

  const results = Array.isArray(payload?.results) ? payload.results : null;
  if (!results) {
    return 'success';
  }

  const hasSuccess = results.some((r) => r.status === 'success');
  const hasFailure = results.some((r) => r.status !== 'success');

  if (hasSuccess && hasFailure) return 'partial';
  if (hasFailure) return 'failure';
  return 'success';
}

export async function withAuditLog({
  auditStore,
  requestId,
  idempotencyKey = null,
  method,
  path,
  body,
  execute
}) {
  const startedAt = Date.now();
  const result = await execute();
  const durationMs = Date.now() - startedAt;

  const entry = {
    requestId,
    idempotencyKey: idempotencyKey || null,
    method,
    path,
    body,
    statusCode: result.statusCode,
    payload: result.payload,
    durationMs,
    outcome: deriveOutcome(result.statusCode, result.payload)
  };

  auditStore.record(entry).catch((err) => {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'audit_write_failed',
        ...entry,
        auditError: err?.message || String(err)
      })
    );
  });

  return result;
}

export async function createAuditStore(env = {}) {
  const backend = String(env.auditBackend || env.idempotencyBackend || 'memory').toLowerCase();

  if (backend === 'firestore') {
    return createFirestoreAuditStore(env);
  }

  return createMemoryAuditStore();
}

function createMemoryAuditStore() {
  const entries = [];

  return {
    entries,
    async record(entry) {
      entries.push({
        ...entry,
        timestamp: new Date(),
        auditWriteStatus: 'ok'
      });
    },
    async query({ limit = 20, cursor = null }) {
      const sorted = [...entries].reverse();
      let startIndex = 0;
      if (cursor) {
        const cursorIndex = sorted.findIndex((e, i) => String(i) === cursor);
        startIndex = cursorIndex >= 0 ? cursorIndex : 0;
      }
      const page = sorted.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < sorted.length;
      return {
        entries: page,
        nextCursor: hasMore ? String(startIndex + limit) : null
      };
    }
  };
}

async function createFirestoreAuditStore(env) {
  const module = await import('@google-cloud/firestore');
  const Firestore = module.Firestore || module.default?.Firestore;

  if (!Firestore) {
    throw new Error('Firestore SDK is unavailable for audit backend');
  }

  const firestoreOptions = {};
  const projectId = env.idempotencyProjectId || '';
  const databaseId = env.idempotencyDatabaseId || '';
  if (projectId) firestoreOptions.projectId = projectId;
  if (databaseId) firestoreOptions.databaseId = databaseId;

  const db = Object.keys(firestoreOptions).length > 0
    ? new Firestore(firestoreOptions)
    : new Firestore();
  const collection = env.auditCollection || DEFAULT_AUDIT_COLLECTION;
  const ref = db.collection(collection);

  return {
    async record(entry) {
      await ref.add({
        ...entry,
        timestamp: new Date(),
        auditWriteStatus: 'ok'
      });
    },
    async query({ limit = 20, cursor = null }) {
      let q = ref.orderBy('timestamp', 'desc').limit(limit);
      if (cursor) {
        const cursorDoc = await ref.doc(cursor).get();
        if (cursorDoc.exists) {
          q = q.startAfter(cursorDoc);
        }
      }
      const snapshot = await q.get();
      const entries = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate?.() ?? data.timestamp
        };
      });
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      return {
        entries,
        nextCursor: entries.length === limit && lastDoc ? lastDoc.id : null
      };
    }
  };
}
