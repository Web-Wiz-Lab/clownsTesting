export async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return null;
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

export function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

export function getPathAndQuery(reqUrl) {
  const parsed = new URL(reqUrl, 'http://localhost');
  return {
    path: parsed.pathname,
    query: parsed.searchParams
  };
}

export function readRequestBodySafely(req, requestId) {
  return parseJsonBody(req).catch((error) => {
    error.statusCode = 400;
    error.code = 'INVALID_JSON';
    error.requestId = requestId;
    throw error;
  });
}
