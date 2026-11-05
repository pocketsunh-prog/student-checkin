import './lib/node-compat';
import { createApp } from './app';
import { config } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { initStorage } from './services/storage.service';
import { initFaceService } from './face';

async function main(): Promise<void> {
  await initStorage();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`API listening on port ${config.port}`, {
      env: config.nodeEnv,
      faceProvider: config.face.provider,
    });
  });

  // Model loading takes a few seconds in Docker; never block the HTTP server.
  void initFaceService().catch(() => {
    logger.warn(
      `Face provider '${config.face.provider}' not ready; kiosk verify will return 503 until it initialises`,
    );
  });

  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}; shutting down`);
    server.close(() => {
      void prisma
        .$disconnect()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.error('Failed to start server', { error });
  void prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
