"use client";
import { dHashFromGray } from "@sparrow/shared";

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return await createImageBitmap(file);
}

/** Resize to fit 1280px and re-encode as JPEG (also strips EXIF metadata). */
export async function compressImage(file: Blob, max = 1280, quality = 0.72): Promise<Blob> {
  const bmp = await loadBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process the photo"))), "image/jpeg", quality),
  );
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
