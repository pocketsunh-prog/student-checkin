import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { normalizeVector, dotNormalized } from './cosine';

interface DescriptorEntry {
  studentId: string;
  vector: Float32Array;
  hash: string | null;
}

const CACHE_TTL_MS = 30_000;

let cache: Map<string, DescriptorEntry> | null = null;
let cacheLoadedAt = 0;
let loadPromise: Promise<Map<string, DescriptorEntry>> | null = null;

/**
 * Active students with a face descriptor, cached in memory (normalised vectors)
 * so a kiosk match is O(students * 1024) without touching MySQL per scan.
 */
async function loadDescriptors(): Promise<Map<string, DescriptorEntry>> {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const rows = await prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        faceDescriptor: { not: Prisma.DbNull },
      },
      select: { studentId: true, faceDescriptor: true, faceDescriptorHash: true },
    });

    const next = new Map<string, DescriptorEntry>();
    for (const row of rows) {
      const raw = row.faceDescriptor;
      if (!Array.isArray(raw) || raw.length === 0) continue;

      const numbers: number[] = [];
      let valid = true;
      for (const value of raw) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          valid = false;
          break;
        }
        numbers.push(value);
      }
      if (!valid) continue;

      const { vector, norm } = normalizeVector(numbers);
      if (norm === 0) continue;
      next.set(row.studentId, { studentId: row.studentId, vector, hash: row.faceDescriptorHash });
    }

    cache = next;
    cacheLoadedAt = Date.now();
    loadPromise = null;
    return next;
  })();

  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }
}

export interface BestMatch {
  studentId: string;
  similarity: number;
}

/**
 * Best cosine similarity among active enrolled students.
 * `excludeStudentId` is used by the duplicate-face guard on re-enrollment.
 */
export async function findBestMatch(
  descriptor: readonly number[],
  options: { excludeStudentId?: string } = {},
): Promise<BestMatch | null> {
  const entries = await loadDescriptors();
  if (entries.size === 0) return null;

  const probe = normalizeVector(descriptor).vector;
  let best: BestMatch | null = null;
  for (const entry of entries.values()) {
    if (entry.studentId === options.excludeStudentId) continue;
    const similarity = dotNormalized(probe, entry.vector);
    if (!best || similarity > best.similarity) {
      best = { studentId: entry.studentId, similarity };
    }
  }
  return best;
}

export function invalidateDescriptorCache(): void {
  cache = null;
  cacheLoadedAt = 0;
  loadPromise = null;
}

export async function countEnrolledDescriptors(): Promise<number> {
  return (await loadDescriptors()).size;
}
