import { describe, expect, it } from "vitest";
import { recentDaysFrom, suggestTaskCount, type RecentDay } from "./suggest";
import { copy } from "./copy";

const day = (date: string, planned: number, completion: number): RecentDay => ({ date, planned, completion });

describe("suggested number of tasks", () => {
  it("starts at 3 with no history", () => expect(suggestTaskCount([])).toEqual({ count: 3, reason: "start" }));
  it("suggests one more after mostly full days", () =>
    expect(suggestTaskCount([day("2026-11-01", 3, 1), day("2026-11-02", 3, 0.9)])).toEqual({ count: 4, reason: "stretch" }));
  it("keeps the usual number after about half", () =>
    expect(suggestTaskCount([day("2026-11-01", 3, 0.5), day("2026-11-02", 3, 0.7)])).toEqual({ count: 3, reason: "steady" }));
  it("suggests one fewer after heavy days", () =>
    expect(suggestTaskCount([day("2026-11-01", 4, 0.25), day("2026-11-02", 4, 0)])).toEqual({ count: 3, reason: "smaller" }));
  it("never goes below 1 or above 5", () => {
    expect(suggestTaskCount([day("2026-11-01", 1, 0)]).count).toBe(1);
    expect(suggestTaskCount([day("2026-11-01", 5, 1)]).count).toBe(5);
  });
  it("only looks at the newest seven days", () => {
    const old = Array.from({ length: 10 }, (_, i) => day(`2026-10-${String(i + 10).padStart(2, "0")}`, 5, 0));
    const recent = Array.from({ length: 7 }, (_, i) => day(`2026-11-0${i + 1}`, 2, 1));
    expect(suggestTaskCount([...old, ...recent])).toEqual({ count: 3, reason: "stretch" });
  });
  it("caps a low-mood morning and a lighter day at two", () => {
    const full = [day("2026-11-01", 4, 1)];
    expect(suggestTaskCount(full, { mood: 2 })).toEqual({ count: 2, reason: "mood" });
    expect(suggestTaskCount(full, { lightDay: true })).toEqual({ count: 2, reason: "light" });
    expect(suggestTaskCount([day("2026-11-01", 1, 0.5)], { mood: 1 }).reason).toBe("steady");
  });
  it("ignores days with nothing countable", () => expect(suggestTaskCount([day("2026-11-01", 0, 1)]).reason).toBe("start"));
  it("has wording for every reason", () => {
    for (const r of ["start", "stretch", "steady", "smaller", "mood", "light"] as const) expect(copy.today.suggestionWhy[r]).toBeTruthy();
  });
  it("builds recent days from plans and items (moved items don't count, partly counts half)", () => {
    const rows = recentDaysFrom(
      [
        { id: "a", date: "2026-11-01", reviewed_at: "x" },
        { id: "b", date: "2026-11-02", reviewed_at: null },
      ],
      [
        { daily_plan_id: "a", status: "done" },
        { daily_plan_id: "a", status: "partial" },
        { daily_plan_id: "a", status: "rescheduled" },
        { daily_plan_id: "b", status: "done" },
      ],
    );
    expect(rows).toEqual([{ date: "2026-11-01", planned: 2, completion: 0.75 }]);
  });
});
