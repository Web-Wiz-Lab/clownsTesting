import { ApiError } from '../middleware/errors.js';
import { formatDateForCaspio } from '../domain/timezone.js';

function encodeQuery(query) {
  return Object.entries(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

function tryParseJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function extractTokenPayload(rawData) {
  const data = tryParseJson(rawData);

  const candidates = [
    data,
    data?.data,
    data?.result,
    data?.Result,
    Array.isArray(data) ? data[0] : null,
    data?.body,
    data?.payload
  ]
    .map(tryParseJson)
    .filter(Boolean);

  for (const candidate of candidates) {
    if (candidate?.access_token) {
      const expires = Number(candidate.expires_in ?? 3600);
      return {
        accessToken: candidate.access_token,
        expiresIn: Number.isFinite(expires) && expires > 0 ? expires : 3600
      };
    }
  }

  return null;
}

export function createCaspioClient(env) {
  const tokenState = {
    token: env.caspioAccessToken || null,
    expiresAt: env.caspioAccessToken ? Date.now() + 60 * 60 * 1000 : 0
  };

  async function fetchWebhookToken(requestId) {
    if (!env.caspioTokenWebhookUrl) {
      throw new ApiError('Caspio token webhook URL is not configured', {
        statusCode: 500,
        code: 'CASPIO_AUTH_CONFIG_ERROR'
      });
    }

    const response = await fetch(env.caspioTokenWebhookUrl, { method: 'GET' });
    if (!response.ok) {
      throw new ApiError('Failed to retrieve Caspio token', {
        statusCode: 502,
        code: 'CASPIO_AUTH_FAILED',
        details: { requestId, status: response.status }
      });
    }

    const data = await parseResponseBody(response);
    const token = extractTokenPayload(data);
    if (!token) {
      throw new ApiError('Invalid Caspio token response', {
        statusCode: 502,
        code: 'CASPIO_AUTH_BAD_RESPONSE',
        details: { requestId, payload: data }
      });
    }

    tokenState.token = token.accessToken;
    tokenState.expiresAt = Date.now() + token.expiresIn * 1000;
    return tokenState.token;
  }

  async function getToken(requestId) {
    const hasBuffer = tokenState.expiresAt - Date.now() > 5 * 60 * 1000;
    if (tokenState.token && hasBuffer) {
      return tokenState.token;
    }

    if (env.caspioAccessToken && !env.caspioTokenWebhookUrl) {
      return env.caspioAccessToken;
    }

    return fetchWebhookToken(requestId);
  }

  async function request(path, query, requestId, retryWithFreshToken = true) {
    const token = await getToken(requestId);
    const queryString = query ? `?${encodeQuery(query)}` : '';
    const url = `${env.caspioBaseUrl}${path}${queryString}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      }
    });

    if ((response.status === 401 || response.status === 403) && retryWithFreshToken && env.caspioTokenWebhookUrl) {
      await fetchWebhookToken(requestId);
      return request(path, query, requestId, false);
    }

    if (!response.ok) {
      const payload = await parseResponseBody(response);
      throw new ApiError('Caspio request failed', {
        statusCode: response.status,
        code: 'CASPIO_REQUEST_FAILED',
        details: { requestId, url, status: response.status, payload }
      });
    }

    const data = await parseResponseBody(response);
    return data?.Result || [];
  }

  return {
    getTeamAssignmentsByDate(dateIso, requestId) {
      const date = formatDateForCaspio(dateIso);
      return request(
        '/views/v_Staff_Assingment_Sling_ID/records',
        {
          'q.select':
            'tbl_team_assignment_Start_Date,tbl_team_assignment_Team,tbl_team_assignment_Team_Main_ID,tbl_team_assignment_Team_Assist_ID,tbl_entertainers_Sling_ID',
          'q.where': `tbl_team_assignment_Start_Date='${date}'`
        },
        requestId
      );
    },
    getEntertainerSlingIds(entertainerIds, requestId) {
      if (!entertainerIds.length) return Promise.resolve([]);
      const values = entertainerIds.map((id) => `'${id}'`).join(',');
      return request(
        '/tables/tbl_entertainers/records',
        {
          'q.select': 'SLING_ID,Entertainer_ID',
          'q.where': `Entertainer_ID IN (${values})`
        },
        requestId
      );
    }
  };
}
