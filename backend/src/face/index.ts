import { config } from '../config/env';
import { logger } from '../lib/logger';
import { HumanFaceProvider } from './human';
import { MockFaceProvider } from './mock';
import type { FaceProvider } from './types';

let provider: FaceProvider | null = null;
let initPromise: Promise<void> | null = null;
let initError: Error | null = null;
let initialised = false;

export function getFaceProvider(): FaceProvider {
  if (!provider) {
    provider =
      config.face.provider === 'human'
        ? new HumanFaceProvider(config.face.modelPath, config.face.minConfidence)
        : new MockFaceProvider();
  }
  return provider;
}

export function isFaceProviderReady(): boolean {
  return provider?.isReady() ?? false;
}

/**
 * Initialise the configured provider. Human model loading takes a few seconds in
 * Docker; the HTTP server starts first and reports 503 until this resolves.
 */
export function initFaceService(): Promise<void> {
  if (initialised) return Promise.resolve();
  if (initPromise) return initPromise;

  const instance = getFaceProvider();
  initPromise = instance
    .init()
    .then(() => {
      initialised = true;
      initError = null;
      logger.info(`Face provider initialised (${instance.kind})`);
    })
    .catch((error: unknown) => {
      initError = error instanceof Error ? error : new Error(String(error));
      initPromise = null;
      logger.error('Face provider initialisation failed', { error: initError });
      throw initError;
    })
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
}

export function getFaceInitError(): Error | null {
  return initError;
}

export type FaceServiceStatus = 'ready' | 'loading' | 'unavailable';

export function faceServiceStatus(): FaceServiceStatus {
  if (isFaceProviderReady()) return 'ready';
  if (config.face.provider === 'mock') return 'unavailable';
  return initError ? 'unavailable' : 'loading';
}
