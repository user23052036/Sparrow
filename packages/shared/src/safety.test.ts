import { describe, expect, it } from "vitest";
import { dayShape, isHeavyStretch, isLowMood, nextDay, trimToLight } from "./safety";

const rows = (...c: [string, number][]) => c.map(([date, completion]) => ({ date, completion }));

describe("isLowMood", () => {
  it.each([[1, true], [2, true], [3, false], [5, false], [null, false]])("mood %s -> %s", (m, want) =>
    expect(isLowMood(m as number | null)).toBe(want));
});

describe("isHeavyStretch", () => {
  const heavy = rows(["2026-11-05", 0], ["2026-11-06", 0.2], ["2026-11-07", 0.33]);
  it("is true for three consecutive heavy days, in any order", () => {
    expect(isHeavyStretch(heavy)).toBe(true);
    expect(isHeavyStretch([...heavy].reverse())).toBe(true);
  });
  it("needs three days", () => expect(isHeavyStretch(heavy.slice(0, 2))).toBe(false));
  it("one okay day breaks it", () =>
    expect(isHeavyStretch(rows(["2026-11-05", 0], ["2026-11-06", 0.5], ["2026-11-07", 0]))).toBe(false));
  it("a gap in the dates breaks it", () =>
    expect(isHeavyStretch(rows(["2026-11-01", 0], ["2026-11-06", 0], ["2026-11-07", 0]))).toBe(false));
  it("only the latest three days matter", () =>
    expect(isHeavyStretch([...rows(["2026-11-01", 1]), ...heavy])).toBe(true));
  it("works across month ends", () =>
    expect(isHeavyStretch(rows(["2026-10-30", 0], ["2026-10-31", 0], ["2026-11-01", 0]))).toBe(true));
  it("treats the 0.34 line as not heavy", () =>
    expect(isHeavyStretch(rows(["2026-11-05", 0], ["2026-11-06", 0], ["2026-11-07", 0.34]))).toBe(false));
});

describe("dayShape", () => {
  const base = { mood: 3, gentle: false, lightDay: false, heavyStretch: false };
  it("normal day: five tasks, stake available, no offer", () =>
    expect(dayShape(base)).toEqual({ maxTasks: 5, showStake: true, offerLightDay: false }));
  it("low mood offers a lighter day but does not force it", () =>
    expect(dayShape({ ...base, mood: 1 })).toEqual({ maxTasks: 5, showStake: true, offerLightDay: true }));
  it("a heavy stretch offers it too", () => expect(dayShape({ ...base, heavyStretch: true }).offerLightDay).toBe(true));
  it("once chosen: two tasks, no stake, no repeated offer", () =>
    expect(dayShape({ ...base, mood: 1, lightDay: true })).toEqual({ maxTasks: 2, showStake: false, offerLightDay: false }));
  it("gentle mode never shows a stake", () => expect(dayShape({ ...base, gentle: true }).showStake).toBe(false));
});

describe("helpers", () => {
  it("trimToLight keeps two", () => expect(trimToLight(["a", "b", "c", "d"])).toEqual(["a", "b"]));
  it("nextDay", () => {
    expect(nextDay("2026-11-08")).toBe("2026-11-09");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
  });
});
