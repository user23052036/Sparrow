import { describe, expect, it } from "vitest";
import { BANNED_WORDS, copy } from "./copy";

describe("gentle-language checklist", () => {
  const all = Object.values(copy)
    .map((v) => (typeof v === "function" ? (v as (...a: number[]) => string)(1, 2) : v))
    .join(" ")
    .toLowerCase();
  it.each(BANNED_WORDS)("copy never uses %j", (w) => expect(all).not.toMatch(new RegExp(`\\b${w}\\b`)));
});
