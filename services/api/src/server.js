import http from 'node:http';

import { loadEnv } from './config/env.js';
import { createSlingClient } from './clients/sling.js';
import { createCaspioClient } from './clients/caspio.js';
import { createErrorReporterClient } from './clients/error-reporter.js';
import { createRequestHandler } from './app.js';

const env = loadEnv();
const slingClient = createSlingClient(env);
const caspioClient = createCaspioClient(env);
const errorReporterClient = createErrorReporterClient(env);

const handler = createRequestHandler({ env, slingClient, caspioClient, errorReporterClient });
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
