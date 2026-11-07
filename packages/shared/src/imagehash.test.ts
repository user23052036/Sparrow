import { describe, expect, it } from "vitest";
import { dHashFromGray, hammingHex } from "./imagehash";

describe("dHash", () => {
  it("is all ones for a left-to-right gradient", () => {
    const g = Array.from({ length: 72 }, (_, i) => i % 9);
    expect(dHashFromGray(g)).toBe("ffffffffffffffff");
  });
  it("is all zeros for a flat image", () => {
    expect(dHashFromGray(new Array(72).fill(128))).toBe("0000000000000000");
  });
  it("hamming distance counts differing bits", () => {
    expect(hammingHex("ff00", "0f00")).toBe(4);
    expect(hammingHex("abcd", "abcd")).toBe(0);
  });
});
