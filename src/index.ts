import type { Server } from 'node:http';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { env } from './config/env';
import { loadMatrix } from './services/role-permission.service';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  await connectDatabase();
  // The role matrix is read on every guarded request, so it is cached before the first one.
  await loadMatrix();

  const server: Server = createApp().listen(env.PORT, () => {
    logger.info(`GOTC API listening on http://localhost:${env.PORT}/api`);
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      void disconnectDatabase().then(() => process.exit(0));
    });
    // Do not let a hung connection hold the process open forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'Failed to start the GOTC API');
  process.exit(1);
});
