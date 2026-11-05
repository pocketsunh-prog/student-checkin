import type { Prisma, Settings } from '@prisma/client';
import { config } from '../config/env';
import { prisma } from '../lib/prisma';

const CACHE_TTL_MS = 10_000;

let cached: Settings | null = null;
let cachedAt = 0;

/**
 * Settings are a single row (id = 1). They are read on nearly every request, so
 * cache them briefly; writes invalidate the cache immediately.
 */
export async function getSettings(): Promise<Settings> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  let settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await prisma.settings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        schoolDays: [1, 2, 3, 4, 5],
        faceMatchThreshold: config.face.matchThreshold,
      },
      update: {},
    });
  }

  cached = settings;
  cachedAt = Date.now();
  return settings;
}

export function invalidateSettingsCache(): void {
  cached = null;
  cachedAt = 0;
}

export async function updateSettings(patch: Prisma.SettingsUpdateInput): Promise<Settings> {
  const updated = await prisma.settings.update({ where: { id: 1 }, data: patch });
  cached = updated;
  cachedAt = Date.now();
  return updated;
}
