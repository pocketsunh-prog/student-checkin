import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.isProduction ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!config.isProduction) {
  globalForPrisma.prisma = prisma;
}
