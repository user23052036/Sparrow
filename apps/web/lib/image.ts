"use client";
import { compressWithin, copy, dHashFromGray, EXIF_SCAN_BYTES, photoAgeHours } from "@sparrow/shared";

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return await createImageBitmap(file);
}

/**
 * Resize and re-encode as JPEG (also strips EXIF metadata), trying smaller settings until the
 * result is under MAX_PROOF_BYTES (about 500 KB).
 */
export async function compressImage(file: Blob): Promise<Blob> {
  const bmp = await loadBitmap(file);
  return await compressWithin(({ max, quality }) => {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(copy.proof.processError))), "image/jpeg", quality));
  });
}

/** 64-bit difference hash used to notice re-used photos. */
export async function imageDHash(file: Blob): Promise<string> {
  const bmp = await loadBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, 9, 8);
  const { data } = ctx.getImageData(0, 0, 9, 8);
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  return dHashFromGray(gray);
}

/**
 * Hours between the photo's own date (EXIF) and now, or null when it has none. Read from the
 * original file, because compressImage() strips EXIF. A hint only (DECISIONS D32).
 */
export async function photoAge(file: Blob): Promise<number | null> {
  try {
    return photoAgeHours(new Uint8Array(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer()), new Date());
  } catch {
    return null;
  }
}
