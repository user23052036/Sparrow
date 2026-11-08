import { describe, expect, it } from "vitest";
import { BADGE_KEYS, moodWord, splitBadges } from "./progress";
import { copy } from "./copy";

describe("progress helpers", () => {
  it("splits badges in display order and ignores unknown keys", () => {
    const r = splitBadges(["run_3", "first_plan", "something_new"]);
    expect(r.earned).toEqual(["first_plan", "run_3"]);
    expect(r.notYet).toEqual(BADGE_KEYS.filter((k) => k !== "first_plan" && k !== "run_3"));
  });
  it("names moods from Heavy to Bright", () => {
    expect(moodWord(1)).toBe("Heavy");
    expect(moodWord(5)).toBe("Bright");
    expect(moodWord(null)).toBeNull();
    expect(moodWord(9)).toBeNull();
  });
  it("has copy for every badge", () => {
    for (const k of BADGE_KEYS) {
      expect(copy.progress.badges[k].name).toBeTruthy();
      expect(copy.progress.badges[k].how).toBeTruthy();
    }
  });
});
