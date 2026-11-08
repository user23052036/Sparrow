/**
 * Difference hash (dHash) from a 9x8 grayscale pixel array (72 values, row-major).
 * Returns a 16-char hex string (64 bits). Used to flag re-used proof photos.
 */
export function dHashFromGray(gray: ArrayLike<number>): string {
  if (gray.length !== 72) throw new Error("dHash expects 9x8 = 72 grayscale values");
  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += gray[y * 9 + x] < gray[y * 9 + x + 1] ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) throw new Error("hash length mismatch");
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Same threshold as public.similar_proof_count() in SQL. */
export const SIMILAR_IMAGE_THRESHOLD = 5;
