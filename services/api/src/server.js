import http from 'node:http';

import { loadEnv } from './config/env.js';
import { createSlingClient } from './clients/sling.js';
import { createCaspioClient } from './clients/caspio.js';
import { createErrorReporterClient } from './clients/error-reporter.js';
import { createIdempotencyStore } from './middleware/idempotency.js';
import { createRequestHandler } from './app.js';

console.log(JSON.stringify({ level: 'info', msg: 'starting_server', step: 'load_env' }));
const env = loadEnv();

// Start listening IMMEDIATELY so Cloud Run sees the service as ready
const server = http.createServer((req, res) => {
  if (!globalThis.appReady) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service initializing, please retry' }));
    return;
  }
  globalThis.requestHandler(req, res);
});

server.listen(env.port, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'server_listening',
      port: env.port,
      timezone: env.timezone,
      nodeEnv: env.nodeEnv
    })
  );
});

// Initialize asynchronously after server is listening
(async () => {
  try {
    console.log(JSON.stringify({ level: 'info', msg: 'initializing_app', step: 'create_clients' }));
    const slingClient = createSlingClient(env);
    const caspioClient = createCaspioClient(env);
    const errorReporterClient = createErrorReporterClient(env);

    console.log(JSON.stringify({ level: 'info', msg: 'initializing_app', step: 'create_idempotency_store', backend: env.idempotencyBackend }));
    const idempotencyStore = await createIdempotencyStore(env);
    console.log(JSON.stringify({ level: 'info', msg: 'initializing_app', step: 'idempotency_store_ready' }));

    const handler = createRequestHandler({
      env,
      slingClient,
      caspioClient,
      errorReporterClient,
      idempotencyStore
    });

    globalThis.requestHandler = handler;
    globalThis.appReady = true;

    console.log(JSON.stringify({ level: 'info', msg: 'app_ready' }));
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'app_initialization_failed',
        error: error.message,
        stack: error.stack
      })
    );
    process.exit(1);
  }
})();
