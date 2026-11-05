import crypto from 'node:crypto';
import type { FaceExtraction, FaceProvider } from './types';

export const MOCK_DESCRIPTOR_LENGTH = 1024;

const NO_FACE_MARKER = Buffer.from('__MOCK_NO_FACE__');
const MULTIPLE_FACES_MARKER = Buffer.from('__MOCK_MULTIPLE_FACES__');

/**
 * Deterministic mock provider for tests and for local development on Node
 * versions where the native tfjs-node addon cannot be built.
 *
 * - The descriptor is derived from the SHA-256 of the image bytes, so the same
 *   image always yields the same (normalised) vector: cosine(same, same) = 1.
 * - Different images yield near-orthogonal vectors: cosine ~= 0 in 1024-D.
 * - Test-only markers inside the image bytes simulate detection failures.
 */
export class MockFaceProvider implements FaceProvider {
  readonly kind = 'mock' as const;

  private ready = false;

  async init(): Promise<void> {
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async extract(image: Buffer): Promise<FaceExtraction> {
    if (image.includes(NO_FACE_MARKER)) {
      return { ok: false, reason: 'NO_FACE', message: 'No face detected' };
    }
    if (image.includes(MULTIPLE_FACES_MARKER)) {
      return { ok: false, reason: 'MULTIPLE_FACES', message: 'Multiple faces detected' };
    }
    return {
      ok: true,
      descriptor: descriptorFromImage(image),
      confidence: 0.99,
      box: { left: 0, top: 0, width: 100, height: 100 },
    };
  }
}

/** Deterministic, unit-length 1024-D descriptor derived from the image bytes. */
export function descriptorFromImage(image: Buffer): number[] {
  const digest = crypto.createHash('sha256').update(image).digest();
  let state = digest.readUInt32LE(0) || 1;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const values = new Array<number>(MOCK_DESCRIPTOR_LENGTH);
  let sumSquares = 0;
  for (let i = 0; i < MOCK_DESCRIPTOR_LENGTH; i += 1) {
    const value = next() * 2 - 1;
    values[i] = value;
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares) || 1;
  for (let i = 0; i < MOCK_DESCRIPTOR_LENGTH; i += 1) {
    values[i] = (values[i] ?? 0) / norm;
  }
  return values;
}
