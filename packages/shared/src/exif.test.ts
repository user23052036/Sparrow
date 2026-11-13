import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { exifDate, photoAgeHours, PHOTO_OLDER_AFTER_HOURS } from "./exif";

/** A tiny JPEG with an EXIF block, built the way cameras lay it out. */
export function jpegWithExif(opts: { original?: string; digitized?: string; dateTime?: string; little?: boolean } = {}): Uint8Array {
  const little = opts.little ?? true;
  const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) => (little ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);

  const ifd0Tags: [number, string | number][] = [];
  if (opts.dateTime) ifd0Tags.push([0x0132, opts.dateTime]);
  const exifTags: [number, string][] = [];
  if (opts.original) exifTags.push([0x9003, opts.original]);
  if (opts.digitized) exifTags.push([0x9004, opts.digitized]);
  if (exifTags.length) ifd0Tags.push([0x8769, 0]);

  const ifd0At = 8;
  const ifd0Size = 2 + ifd0Tags.length * 12 + 4;
  const exifAt = ifd0At + ifd0Size;
  const exifSize = exifTags.length ? 2 + exifTags.length * 12 + 4 : 0;
  const dataAt = exifAt + exifSize;
  const data: number[] = [];
  const place = (s: string) => {
    const at = dataAt + data.length;
    data.push(...ascii(s));
    return at;
  };
  const dir = (tags: [number, string | number][]) => {
    const out = [...u16(tags.length)];
    for (const [tag, v] of tags) {
      if (typeof v === "string") out.push(...u16(tag), ...u16(2), ...u32(v.length + 1), ...u32(place(v)));
      else out.push(...u16(tag), ...u16(4), ...u32(1), ...u32(exifAt));
    }
    return out.concat(u32(0));
  };
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0At), ...dir(ifd0Tags), ...(exifTags.length ? dir(exifTags) : []), ...data];
  const body = [...ascii("Exif"), 0, ...tiff];
  const len = body.length + 2;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xe1, len >> 8, len & 0xff, ...body, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
}

describe("exifDate", () => {
  it("reads the date a photo was taken (little- and big-endian files)", () => {
    for (const little of [true, false]) {
      expect(exifDate(jpegWithExif({ original: "2026:11:09 08:15:30", little }))).toEqual({ year: 2026, month: 11, day: 9, hour: 8, minute: 15, second: 30 });
    }
  });

  it("prefers the original date, then digitized, then the file's date", () => {
    expect(exifDate(jpegWithExif({ original: "2026:01:02 03:04:05", digitized: "2025:01:01 00:00:00", dateTime: "2024:01:01 00:00:00" }))?.year).toBe(2026);
    expect(exifDate(jpegWithExif({ digitized: "2025:06:01 10:00:00", dateTime: "2024:01:01 00:00:00" }))?.year).toBe(2025);
    expect(exifDate(jpegWithExif({ dateTime: "2024:03:04 05:06:07" }))?.year).toBe(2024);
  });

  it("returns null when there is nothing trustworthy to read", () => {
    expect(exifDate(new Uint8Array())).toBeNull();
    expect(exifDate(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]))).toBeNull(); // a PNG
    expect(exifDate(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9]))).toBeNull(); // a JPEG without EXIF
    expect(exifDate(jpegWithExif({}))).toBeNull(); // EXIF without a date
    expect(exifDate(jpegWithExif({ original: "0000:00:00 00:00:00" }))).toBeNull();
    expect(exifDate(jpegWithExif({ original: "not a date at all!!" }))).toBeNull();
  });

  it("never throws on cut-off or scrambled files", () => {
    const good = jpegWithExif({ original: "2026:11:09 08:15:30", dateTime: "2026:11:09 08:15:30" });
    for (let n = 0; n <= good.length; n++) expect(() => exifDate(good.subarray(0, n))).not.toThrow();
    for (let k = 0; k < good.length; k++) {
      const bad = good.slice();
      bad[k] = 0xff;
      expect(() => exifDate(bad)).not.toThrow();
      bad[k] = 0x00;
      expect(() => exifDate(bad)).not.toThrow();
    }
  });
});

describe("photoAgeHours", () => {
  const photo = jpegWithExif({ original: "2026:11:09 08:00:00" });
  it("counts whole hours on the device's own clock", () => {
    expect(photoAgeHours(photo, new Date(2026, 10, 9, 8, 59))).toBe(0);
    expect(photoAgeHours(photo, new Date(2026, 10, 9, 11, 30))).toBe(3);
    expect(photoAgeHours(photo, new Date(2026, 10, 12, 8, 0))).toBe(72);
  });
  it("treats a date in the future as fresh, and no date as unknown", () => {
    expect(photoAgeHours(photo, new Date(2026, 10, 9, 7, 0))).toBe(0);
    expect(photoAgeHours(new Uint8Array([1, 2, 3]), new Date())).toBeNull();
  });
  it("uses the same one-day line as proof_context() in the database", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0023_proof_context.sql"), "utf8");
    expect(sql).toContain(`p.photo_age_hours > ${PHOTO_OLDER_AFTER_HOURS} then 'older'`);
  });
});
