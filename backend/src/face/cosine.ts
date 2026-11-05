export interface NormalizedVector {
  vector: Float32Array;
  /** L2 norm of the original vector (0 when the input is all zeros). */
  norm: number;
}

export function normalizeVector(values: ArrayLike<number>): NormalizedVector {
  const vector = new Float32Array(values.length);
  let sumSquares = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i] ?? 0;
    vector[i] = value;
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares);
  if (norm > 0) {
    for (let i = 0; i < vector.length; i += 1) {
      vector[i] = (vector[i] ?? 0) / norm;
    }
  }
  return { vector, norm };
}

/** Dot product of two already-normalised vectors == cosine similarity. */
export function dotNormalized(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < length; i += 1) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
  }
  if (dot > 1) return 1;
  if (dot < -1) return -1;
  return dot;
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
