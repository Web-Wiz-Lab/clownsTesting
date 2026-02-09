import http from 'node:http';

import { loadEnv } from './config/env.js';
import { createSlingClient } from './clients/sling.js';
import { createCaspioClient } from './clients/caspio.js';
import { createErrorReporterClient } from './clients/error-reporter.js';
import { createIdempotencyStore } from './middleware/idempotency.js';
import { createRequestHandler } from './app.js';

try {
  console.log(JSON.stringify({ level: 'info', msg: 'starting_server', step: 'load_env' }));
  const env = loadEnv();

  console.log(JSON.stringify({ level: 'info', msg: 'starting_server', step: 'create_clients' }));
  const slingClient = createSlingClient(env);
  const caspioClient = createCaspioClient(env);
  const errorReporterClient = createErrorReporterClient(env);

  console.log(JSON.stringify({ level: 'info', msg: 'starting_server', step: 'create_idempotency_store', backend: env.idempotencyBackend }));
  const idempotencyStore = await createIdempotencyStore(env);
  console.log(JSON.stringify({ level: 'info', msg: 'starting_server', step: 'idempotency_store_ready' }));

  const handler = createRequestHandler({
    env,
    slingClient,
    caspioClient,
    errorReporterClient,
    idempotencyStore
  });
  const server = http.createServer((req, res) => {
    handler(req, res);
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
} catch (error) {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'server_startup_failed',
      error: error.message,
      stack: error.stack
    })
  );
  process.exit(1);
}
