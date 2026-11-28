import http from 'node:http';
import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { env } from './config/env.js';
import { initSocketServer } from './realtime/socket.js';

const port = env.PORT || 5000;
const httpServer = http.createServer(app);

if (env.SOCKET_ENABLED) {
  initSocketServer(httpServer);
}

httpServer.listen(port, () => {
  console.log(`[Hesheli Modular Server] running on http://localhost:${port}`);
});

const shutdown = (signal: string) => {
  console.log(`[Hesheli Modular Server] received ${signal}, shutting down...`);
  httpServer.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
