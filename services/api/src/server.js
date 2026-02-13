import http from 'node:http';

import { loadEnv } from './config/env.js';
import { createSlingClient } from './clients/sling.js';
import { createCaspioClient } from './clients/caspio.js';
import { createErrorReporterClient } from './clients/error-reporter.js';
import { createIdempotencyStore } from './middleware/idempotency.js';
import { createRequestHandler } from './app.js';

const env = loadEnv();
const slingClient = createSlingClient(env);
const caspioClient = createCaspioClient(env);
const errorReporterClient = createErrorReporterClient(env);
const idempotencyStore = await createIdempotencyStore(env);

const handler = createRequestHandler({
  env,
  slingClient,
  caspioClient,
  errorReporterClient,
  idempotencyStore
});
process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({ level: 'fatal', msg: 'unhandled_rejection', error: String(reason) }));
});

const server = http.createServer((req, res) => {
  handler(req, res).catch((err) => {
    console.error(JSON.stringify({ level: 'error', msg: 'unhandled_request_error', error: err?.message }));
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ summary: 'failed', error: { code: 'INTERNAL_ERROR' } }));
    } else {
      res.destroy();
    }
  });
});

server.listen(env.port, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'server_started',
      port: env.port,
      timezone: env.timezone,
      nodeEnv: env.nodeEnv
    })
  );
});
