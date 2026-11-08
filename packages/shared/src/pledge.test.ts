import { describe, expect, it } from "vitest";
import { PLEDGE_FIRST_LIMIT, PLEDGE_MAX, pledgeLimit, settlePledge } from "./pledge";
import { scoreDay } from "./scoring";

describe("pledgeLimit (gradual raise)", () => {
  it("starts at 20 and doubles with the biggest recent pledge, up to 100", () => {
    expect(pledgeLimit(null)).toBe(PLEDGE_FIRST_LIMIT);
    expect(pledgeLimit(5)).toBe(20);
    expect(pledgeLimit(20)).toBe(40);
    expect(pledgeLimit(40)).toBe(80);
    expect(pledgeLimit(60)).toBe(PLEDGE_MAX);
    expect(pledgeLimit(100)).toBe(PLEDGE_MAX);
  });
});

describe("settlePledge", () => {
  it("clears fully on a full day and keeps partial credit", () => {
    expect(settlePledge(20, 1)).toEqual({ kept: 20, owed: 0 });
    expect(settlePledge(20, 0.5)).toEqual({ kept: 10, owed: 10 });
    expect(settlePledge(15, 0.5)).toEqual({ kept: 7, owed: 8 });
    expect(settlePledge(20, 0)).toEqual({ kept: 0, owed: 20 });
  });
  it("matches the points-stake refund rule used by review_day", () => {
    for (const statuses of [["done", "partial", "missed"], ["done", "done"], ["missed"], ["partial", "partial", "done", "missed"]] as const) {
      const s = scoreDay([...statuses], 37);
      expect(settlePledge(37, s.completion).kept).toBe(s.stakeRefund);
    }
  });
  it("ignores out-of-range completion", () => {
    expect(settlePledge(10, 7)).toEqual({ kept: 10, owed: 0 });
    expect(settlePledge(10, -1)).toEqual({ kept: 0, owed: 10 });
  });
});
