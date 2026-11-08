import { describe, expect, it } from "vitest";
import { ratingText, validHandle } from "./rating";

describe("rating helpers", () => {
  it("formats ratings", () => {
    expect(ratingText(3)).toBe("3 / 5");
    expect(ratingText(1.8)).toBe("1.8 / 5");
  });
  it("accepts only 3 to 20 letters, numbers and underscores", () => {
    expect(validHandle("ab")).toBe(false);
    expect(validHandle("has space")).toBe(false);
    expect(validHandle("a".repeat(21))).toBe(false);
    expect(validHandle("good_name_1")).toBe(true);
  });
});
