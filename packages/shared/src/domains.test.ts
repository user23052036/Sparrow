import { describe, expect, it } from "vitest";
import { normalizeDomain, normalizeDomainList } from "./domains";

describe("normalizeDomain", () => {
  it.each([
    ["youtube.com", "youtube.com"],
    ["https://www.YouTube.com/watch?v=1", "youtube.com"],
    ["reddit.com/r/test", "reddit.com"],
    ["  x.com  ", "x.com"],
    ["m.facebook.com:443", "m.facebook.com"],
  ])("%s -> %s", (input, out) => expect(normalizeDomain(input)).toBe(out));

  it.each(["", "youtube", "not a domain", "-bad.com", "http://"])("rejects %j", (input) => expect(normalizeDomain(input)).toBeNull());

  it("dedupes and sorts lists", () => {
    expect(normalizeDomainList(["www.x.com", "x.com", "b.com", "nope"])).toEqual(["b.com", "x.com"]);
  });
});
