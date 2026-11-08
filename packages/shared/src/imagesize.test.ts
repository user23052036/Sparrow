import { describe, expect, it } from "vitest";
import { COMPRESSION_STEPS, compressWithin, MAX_PROOF_BYTES } from "./imagesize";

describe("compressWithin", () => {
  it("stops at the first step that fits", async () => {
    const tried: number[] = [];
    const out = await compressWithin(async (s) => {
      tried.push(s.quality);
      return { size: s.max * 400 * s.quality };
    });
    expect(out.size).toBeLessThanOrEqual(MAX_PROOF_BYTES);
    expect(tried.length).toBeLessThan(COMPRESSION_STEPS.length + 1);
  });
  it("returns right away when the first try already fits", async () => {
    let calls = 0;
    await compressWithin(async () => {
      calls++;
      return { size: 1000 };
    });
    expect(calls).toBe(1);
  });
  it("falls back to the smallest attempt instead of failing", async () => {
    let i = 0;
    const sizes = [900, 800, 700, 650, 600, 640].map((n) => n * 1024);
    const out = await compressWithin(async () => ({ size: sizes[i++] }));
    expect(out.size).toBe(600 * 1024);
  });
  it("steps get strictly smaller", () => {
    for (let i = 1; i < COMPRESSION_STEPS.length; i++) {
      const a = COMPRESSION_STEPS[i - 1],
        b = COMPRESSION_STEPS[i];
      expect(b.max * b.quality).toBeLessThan(a.max * a.quality);
    }
  });
});
