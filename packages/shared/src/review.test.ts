import { describe, expect, it } from "vitest";
import { copy } from "./copy";
import { base64ToBytes, reviewMessage, reviewStartStatuses } from "./review";

describe("evening review", () => {
  it("starts from what was marked during the day; the rest is 'didn't happen'", () => {
    expect(
      reviewStartStatuses([
        { id: "a", status: "done" },
        { id: "b", status: "pending" },
        { id: "c", status: "partial" },
      ]),
    ).toEqual({ a: "done", b: "missed", c: "partial" });
  });
  it("a full day says so", () => {
    expect(reviewMessage({ total: 40, done: 3, countable: 3, full_day_bonus: 10 }, true)).toBe(`${copy.fullDay} (+40 points)`);
  });
  it("a partial day today offers one small win; an older day does not", () => {
    const r = { total: 10, done: 1, countable: 3, full_day_bonus: 0 };
    expect(reviewMessage(r, true)).toBe(`${copy.partialWin(1, 3)} ${copy.oneSmallWin} (+10 points)`);
    expect(reviewMessage(r, false)).toBe(`${copy.partialWin(1, 3)} (+10 points)`);
  });
});

describe("base64ToBytes", () => {
  it("decodes what Buffer encodes, with and without padding", () => {
    for (const n of [0, 1, 2, 3, 4, 5, 100, 1000]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
      const b64 = Buffer.from(bytes).toString("base64");
      expect(base64ToBytes(b64)).toEqual(bytes);
      expect(base64ToBytes(b64.replace(/=+$/, ""))).toEqual(bytes);
    }
  });
  it("ignores line breaks and refuses anything else", () => {
    expect(base64ToBytes("aGVs\nbG8=")).toEqual(new TextEncoder().encode("hello"));
    expect(() => base64ToBytes("not base64!")).toThrow();
    expect(() => base64ToBytes("a")).toThrow();
  });
});
