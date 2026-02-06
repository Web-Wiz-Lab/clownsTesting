const REQUIRED = [
  'SLING_API_TOKEN',
  'SLING_CALENDAR_ID',
  'SLING_MANAGER_USER_ID',
  'CASPIO_BASE_URL'
];

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function splitCsv(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function loadEnv() {
  const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: intFromEnv('PORT', 8080),
    timezone: process.env.APP_TIMEZONE || 'America/New_York',
    slingBaseUrl: process.env.SLING_BASE_URL || 'https://api.getsling.com',
    slingApiToken: process.env.SLING_API_TOKEN || '',
    slingCalendarId: process.env.SLING_CALENDAR_ID || '',
    slingManagerUserId: process.env.SLING_MANAGER_USER_ID || '',
    caspioBaseUrl: process.env.CASPIO_BASE_URL || '',
    caspioTokenWebhookUrl: process.env.CASPIO_TOKEN_WEBHOOK_URL || '',
    caspioAccessToken: process.env.CASPIO_ACCESS_TOKEN || '',
    corsAllowedOrigins: splitCsv(process.env.CORS_ALLOWED_ORIGINS),
    requestTimeoutMs: intFromEnv('REQUEST_TIMEOUT_MS', 12000),
    retryAttempts: intFromEnv('RETRY_ATTEMPTS', 2)
  };

  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (!env.caspioTokenWebhookUrl && !env.caspioAccessToken) {
    missing.push('CASPIO_TOKEN_WEBHOOK_URL or CASPIO_ACCESS_TOKEN');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return env;
}
