import path from 'node:path';
// Must be imported before @tensorflow/tfjs-node (Node 26 compatibility).
import '../lib/node-compat';
import type { FaceBox, FaceExtraction, FaceProvider } from './types';

type AnyRecord = Record<string, any>;

/** Convert a model directory to the `file://` URL form expected by tfjs-node. */
export function toFileModelBasePath(modelPath: string): string {
  // tfjs-node strips the literal "file://" prefix and then path.resolve()s the
  // remainder, so `file://` + absolute path works on both Linux (/app/models)
  // and Windows (D:/...).
  const normalized = path.resolve(modelPath).replace(/\\/g, '/');
  return `file://${normalized}${normalized.endsWith('/') ? '' : '/'}`;
}

function buildConfig(modelBasePath: string): AnyRecord {
  return {
    backend: 'tensorflow',
    modelBasePath,
    debug: false,
    async: false,
    cacheModels: true,
    filter: { enabled: false },
    face: {
      enabled: true,
      detector: {
        enabled: true,
        rotation: false,
        maxDetected: 4,
        minConfidence: 0.2,
      },
      mesh: { enabled: true },
      iris: { enabled: false },
      // FaceRes 1024-D embedding. skipFrames/skipTime are disabled so every
      // kiosk frame gets a fresh descriptor (Human caches by frame otherwise).
      description: { enabled: true, minConfidence: 0.1, skipFrames: 0, skipTime: 0 },
      emotion: { enabled: false },
      antispoof: { enabled: false },
      liveness: { enabled: false },
      attention: { enabled: false },
      gear: { enabled: false },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
    segmentation: { enabled: false },
  };
}

function readEmbedding(face: AnyRecord): number[] | null {
  const raw = face.embedding ?? face.descriptor;
  if (!raw) return null;

  let values: number[] | null = null;
  if (Array.isArray(raw) || ArrayBuffer.isView(raw)) {
    values = Array.from(raw as ArrayLike<number>, (value) => Number(value));
  } else if (raw.data && (Array.isArray(raw.data) || ArrayBuffer.isView(raw.data))) {
    values = Array.from(raw.data as ArrayLike<number>, (value) => Number(value));
  }

  if (!values || values.length === 0) return null;
  for (const value of values) {
    if (!Number.isFinite(value)) return null;
  }
  return values;
}

function readBox(box: unknown): FaceBox | undefined {
  if (!Array.isArray(box) || box.length < 4) return undefined;
  const [left, top, width, height] = box as number[];
  if (
    typeof left !== 'number' ||
    typeof top !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return undefined;
  }
  return { left, top, width, height };
}

/**
 * Human + TensorFlow.js Node provider. The heavy native modules are imported
 * lazily so tests, typecheck and mock-mode development never load TFJS.
 */
export class HumanFaceProvider implements FaceProvider {
  readonly kind = 'human' as const;

  private human: AnyRecord | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly modelPath: string,
    private readonly minConfidence: number,
  ) {}

  isReady(): boolean {
    return this.ready;
  }

  init(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (!this.initPromise) {
      this.initPromise = this.doInit().catch((error: unknown) => {
        this.initPromise = null;
        this.human = null;
        this.ready = false;
        throw error;
      });
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const humanModule = (await import('@vladmandic/human')) as AnyRecord;
    const HumanCtor =
      humanModule.Human ?? humanModule.default?.Human ?? humanModule.default ?? null;
    if (typeof HumanCtor !== 'function') {
      throw new Error('Could not load @vladmandic/human');
    }

    const config = buildConfig(toFileModelBasePath(this.modelPath));
    const Ctor = HumanCtor as unknown as new (cfg: AnyRecord) => AnyRecord;
    const human = new Ctor(config);

    if (!human.tf) throw new Error('Human did not initialise a TensorFlow backend');
    await human.tf.ready();
    await human.load();

    this.human = human;
    this.ready = true;
  }

  async extract(image: Buffer): Promise<FaceExtraction> {
    const human = this.human;
    if (!human || !this.ready) {
      throw new Error('Human face provider is not initialised');
    }

    let tensor: unknown;
    try {
      tensor = human.tf.tidy(() => {
        const decoded = human.tf.node.decodeImage(image, 3);
        return human.tf.cast(human.tf.expandDims(decoded, 0), 'float32');
      });
    } catch {
      return { ok: false, reason: 'UNREADABLE', message: 'Could not decode image' };
    }

    try {
      const result = (await human.detect(tensor)) as AnyRecord;
      const faces: AnyRecord[] = Array.isArray(result?.face) ? result.face : [];
      const usable = faces.filter((face) => {
        const score = typeof face.boxScore === 'number' ? face.boxScore : 0;
        return score >= this.minConfidence;
      });

      if (usable.length === 0) {
        return { ok: false, reason: 'NO_FACE', message: 'No face detected' };
      }
      if (usable.length > 1) {
        return { ok: false, reason: 'MULTIPLE_FACES', message: 'Multiple faces detected' };
      }

      const face = usable[0]!;
      const descriptor = readEmbedding(face);
      if (!descriptor) {
        throw new Error('Face detected but the embedding model produced no descriptor');
      }
      const box = readBox(face.box);
      const confidence = typeof face.boxScore === 'number' ? face.boxScore : 0;
      return { ok: true, descriptor, confidence, ...(box ? { box } : {}) };
    } finally {
      try {
        human.tf.dispose(tensor);
      } catch {
        /* ignore double-dispose */
      }
    }
  }
}
