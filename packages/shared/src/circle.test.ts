import { describe, expect, it } from "vitest";
import { CIRCLE_MAX_MEMBERS, circleDayLine, circleInviteLink, parseCircleCode } from "./circle";
import { copy } from "./copy";

describe("circles", () => {
  it("holds at most four people (matches join_circle)", () => expect(CIRCLE_MAX_MEMBERS).toBe(4));
  it("builds and reads circle links", () => {
    const link = circleInviteLink("https://sparrow.app/", "0123456789abcdef");
    expect(link).toBe("https://sparrow.app/circle/join?code=0123456789abcdef");
    expect(parseCircleCode(link)).toBe("0123456789abcdef");
    expect(parseCircleCode("not a code")).toBeNull();
  });
  it("describes a day from counts only", () => {
    expect(circleDayLine({ planned: 3, done: 1, partial: 1, closed: false }, true)).toBe(copy.circle.dayLine(2, 3, false));
    expect(circleDayLine({ planned: 0, done: 0, partial: 0, closed: null }, true)).toBe(copy.circle.notPlanned);
    expect(circleDayLine(null, true)).toBe(copy.circle.notPlanned);
    expect(circleDayLine(null, false)).toBe(copy.circle.notSharing);
  });
});
