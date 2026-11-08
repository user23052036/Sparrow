/** Proof photos must stay small (PLAN.md M4: under about 500 KB after compression). */
export const MAX_PROOF_BYTES = 500 * 1024;

export interface CompressionStep {
  /** Longest edge in pixels. */
  max: number;
  /** JPEG quality, 0..1. */
  quality: number;
}

/** Gentlest first; each step is smaller than the one before it. */
export const COMPRESSION_STEPS: readonly CompressionStep[] = [
  { max: 1280, quality: 0.72 },
  { max: 1280, quality: 0.6 },
  { max: 1024, quality: 0.6 },
  { max: 1024, quality: 0.5 },
  { max: 800, quality: 0.5 },
  { max: 640, quality: 0.45 },
];

/**
 * Tries each step until the encoded result fits `limit`, and returns the first that does.
 * If none fits, returns the smallest attempt rather than failing: a slightly large photo
 * is better than losing someone's proof.
 */
export async function compressWithin<T extends { size: number }>(
  encode: (step: CompressionStep) => Promise<T>,
  limit: number = MAX_PROOF_BYTES,
  steps: readonly CompressionStep[] = COMPRESSION_STEPS,
): Promise<T> {
  let best: T | null = null;
  for (const step of steps) {
    const out = await encode(step);
    if (out.size <= limit) return out;
    if (best === null || out.size < best.size) best = out;
  }
  return best as T;
}
