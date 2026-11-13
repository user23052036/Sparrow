/**
 * Reads the "date taken" out of a JPEG's EXIF block, in the browser, before the photo is
 * re-encoded (which strips EXIF). Used only for a gentle hint on proofs (DECISIONS D32): EXIF is
 * easy to edit or remove, so this never proves or disproves anything.
 *
 * Returns null for anything unexpected: other formats, no EXIF, a missing or malformed date.
 */

export interface ExifDate {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Only the start of a file is needed: the EXIF block sits before the image data. */
export const EXIF_SCAN_BYTES = 256 * 1024;

const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_ORIGINAL = 0x9003;
const TAG_DIGITIZED = 0x9004;

function parseDate(s: string): ExifDate | null {
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  if (year < 1990 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) return null;
  return { year, month, day, hour, minute, second };
}

export function exifDate(bytes: Uint8Array): ExifDate | null {
  const n = bytes.length;
  if (n < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // not a JPEG
  let i = 2;
  while (i + 4 <= n) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xda || marker === 0xd9) return null; // image data starts: no EXIF before it
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) return null;
    if (marker === 0xe1 && len >= 8 && i + 10 <= n && String.fromCharCode(...bytes.subarray(i + 4, i + 10)) === "Exif\0\0") {
      return readTiff(bytes.subarray(i + 10, Math.min(n, i + 2 + len)));
    }
    i += 2 + len;
  }
  return null;
}

function readTiff(t: Uint8Array): ExifDate | null {
  if (t.length < 8) return null;
  const little = t[0] === 0x49 && t[1] === 0x49;
  if (!little && !(t[0] === 0x4d && t[1] === 0x4d)) return null;
  const u16 = (o: number) => (o + 2 > t.length ? -1 : little ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
  const u32 = (o: number) => {
    if (o + 4 > t.length) return -1;
    const b = little ? [t[o + 3], t[o + 2], t[o + 1], t[o]] : [t[o], t[o + 1], t[o + 2], t[o + 3]];
    return b[0] * 0x1000000 + ((b[1] << 16) | (b[2] << 8) | b[3]);
  };
  if (u16(2) !== 42) return null;

  /** Tag values found in one directory: ASCII strings by tag, plus the pointer to the EXIF directory. */
  const readDir = (offset: number): { text: Map<number, string>; exif: number } => {
    const text = new Map<number, string>();
    let exif = -1;
    const count = u16(offset);
    if (offset < 8 || count < 0 || count > 500) return { text, exif };
    for (let k = 0; k < count; k++) {
      const e = offset + 2 + k * 12;
      if (e + 12 > t.length) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const num = u32(e + 4);
      if (tag === TAG_EXIF_IFD && type === 4) exif = u32(e + 8);
      if ((tag === TAG_DATETIME || tag === TAG_ORIGINAL || tag === TAG_DIGITIZED) && type === 2 && num >= 19 && num <= 64) {
        const at = u32(e + 8);
        if (at > 0 && at + 19 <= t.length) text.set(tag, String.fromCharCode(...t.subarray(at, at + 19)));
      }
    }
    return { text, exif };
  };

  const first = readDir(u32(4));
  const inner = first.exif > 0 ? readDir(first.exif) : null;
  const raw = inner?.text.get(TAG_ORIGINAL) ?? inner?.text.get(TAG_DIGITIZED) ?? first.text.get(TAG_DATETIME);
  return raw ? parseDate(raw) : null;
}

/**
 * Whole hours between the photo's own date and `now`, both read as the device's local time
 * (EXIF dates carry no time zone). Null when the photo has no readable date; 0 when the date is
 * in the future (a clock that is a little off should not look like anything).
 */
export function photoAgeHours(bytes: Uint8Array, now: Date): number | null {
  const d = exifDate(bytes);
  if (!d) return null;
  const taken = new Date(d.year, d.month - 1, d.day, d.hour, d.minute, d.second).getTime();
  if (Number.isNaN(taken)) return null;
  return Math.max(0, Math.floor((now.getTime() - taken) / 3_600_000));
}

/** Older than this and the photo is noted as "from an earlier day". Mirrors proof_context() in 0023. */
export const PHOTO_OLDER_AFTER_HOURS = 24;
