export type FaceFailReason = 'NO_FACE' | 'MULTIPLE_FACES' | 'UNREADABLE';

export interface FaceBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type FaceExtraction =
  | { ok: true; descriptor: number[]; confidence: number; box?: FaceBox }
  | { ok: false; reason: FaceFailReason; message: string };

/**
 * Provider abstraction so the API can run without TensorFlow.js locally/tests
 * (FACE_PROVIDER=mock) while production uses Human + tfjs-node (FACE_PROVIDER=human).
 */
export interface FaceProvider {
  readonly kind: 'human' | 'mock';
  init(): Promise<void>;
  isReady(): boolean;
  /** Extract exactly one face descriptor (1024-D for Human FaceRes). */
  extract(image: Buffer): Promise<FaceExtraction>;
}
