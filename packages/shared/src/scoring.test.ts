import { describe, expect, it } from "vitest";
import { KIND_ACT_POINTS, POINTS, scoreDay } from "./scoring";

describe("scoreDay", () => {
  it("gives a full-day bonus when everything is done", () => {
    const s = scoreDay(["done", "done"]);
    expect(s).toMatchObject({ itemPoints: 20, fullDayBonus: 10, completion: 1, total: 30 });
  });
  it("one miss keeps credit for the rest (no all-or-nothing)", () => {
    const s = scoreDay(["done", "done", "missed"]);
    expect(s.itemPoints).toBe(20);
    expect(s.fullDayBonus).toBe(0);
    expect(s.total).toBe(20);
  });
  it("partial counts as half", () => {
    expect(scoreDay(["partial", "missed"]).completion).toBe(0.25);
  });
  it("rescheduled items are neutral", () => {
    const s = scoreDay(["done", "rescheduled"]);
    expect(s.completion).toBe(1);
    expect(s.fullDayBonus).toBe(10);
  });
  it("refunds stake in proportion to completion, rounded down", () => {
    expect(scoreDay(["done", "missed"], 25).stakeRefund).toBe(12);
    expect(scoreDay(["done"], 25).stakeRefund).toBe(25);
  });
  it("empty day refunds the whole stake and gives no bonus", () => {
    expect(scoreDay([], 10)).toMatchObject({ stakeRefund: 10, fullDayBonus: 0, total: 10 });
  });
});

describe("kind act points", () => {
  it("match the database rule and stay below finishing a task, so missing on purpose never pays", () => {
    expect(KIND_ACT_POINTS).toBe(5); // public.log_kind_act() in 0011
    expect(KIND_ACT_POINTS).toBeLessThan(POINTS.done);
  });
});
