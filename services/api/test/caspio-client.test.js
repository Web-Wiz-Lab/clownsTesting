import test from 'node:test';
import assert from 'node:assert/strict';

import { createCaspioClient } from '../src/clients/caspio.js';

function buildEnv() {
  return {
    caspioBaseUrl: 'https://example.caspio.test/rest/v2',
    caspioTokenWebhookUrl: 'https://example.make.test/token',
    caspioAccessToken: ''
  };
}

function makeJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? 'application/json' : '';
      }
    },
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test('caspio client accepts root token payload', async () => {
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async (url) => {
    calls += 1;
    if (String(url).includes('/token')) {
      return makeJsonResponse({ access_token: 'abc', expires_in: 3600 });
    }

    return makeJsonResponse({ Result: [] });
  };

  try {
    const client = createCaspioClient(buildEnv());
    const result = await client.getTeamAssignmentsByDate('2026-02-07', 'req-1');
    assert.deepEqual(result, []);
    assert.equal(calls >= 2, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('caspio client accepts array token payload from webhook', async () => {
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async (url) => {
    calls += 1;
    if (String(url).includes('/token')) {
      return makeJsonResponse([{ access_token: 'xyz', expires_in: 1800 }]);
    }

    return makeJsonResponse({ Result: [] });
  };

  try {
    const client = createCaspioClient(buildEnv());
    const result = await client.getTeamAssignmentsByDate('2026-02-07', 'req-2');
    assert.deepEqual(result, []);
    assert.equal(calls >= 2, true);
  } finally {
    global.fetch = originalFetch;
  }
});
