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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CIRCLE_GOAL_DAYS,
  CIRCLE_GOAL_MAX,
  CIRCLE_GOAL_MIN,
  CIRCLE_GOAL_PER_MEMBER,
  circleGoalDaysLeft,
  circleGoalLine,
  circleGoalPercent,
  suggestCircleGoal,
  validCircleGoal,
} from "./circle";

describe("circle goals", () => {
  const now = new Date("2026-11-13T10:00:00Z");
  const base = { target: 10, moved: 4, reached: false, let_go: false, ends_at: "2026-11-16T09:00:00Z", can_start: false, suggested: 10 };
  it("uses the same limits as the migration", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0026_circle_goal.sql"), "utf8");
    expect(sql).toContain(`check (target between ${CIRCLE_GOAL_MIN} and ${CIRCLE_GOAL_MAX})`);
    expect(sql).toContain(`t < ${CIRCLE_GOAL_MIN} or t > ${CIRCLE_GOAL_MAX}`);
    expect(sql).toContain(`now() + interval '${CIRCLE_GOAL_DAYS} days'`);
    expect(sql).toContain(`coalesce(p_target, n * ${CIRCLE_GOAL_PER_MEMBER})`);
    expect(sql).toContain(`least(greatest(n * ${CIRCLE_GOAL_PER_MEMBER}, ${CIRCLE_GOAL_MIN}), ${CIRCLE_GOAL_MAX})`);
  });
  it("suggests five things per person, inside the limits", () => {
    expect(suggestCircleGoal(2)).toBe(10);
    expect(suggestCircleGoal(4)).toBe(20);
    expect(suggestCircleGoal(0)).toBe(CIRCLE_GOAL_MIN);
    expect(suggestCircleGoal(99)).toBe(CIRCLE_GOAL_MAX);
    expect(validCircleGoal(3)).toBe(true);
    expect(validCircleGoal(2)).toBe(false);
    expect(validCircleGoal(101)).toBe(false);
    expect(validCircleGoal(4.5)).toBe(false);
  });
  it("counts days left, rounded up", () => {
    expect(circleGoalDaysLeft("2026-11-16T09:00:00Z", now)).toBe(3);
    expect(circleGoalDaysLeft("2026-11-13T10:30:00Z", now)).toBe(1);
    expect(circleGoalDaysLeft("2026-11-13T09:00:00Z", now)).toBe(0);
  });
  it("keeps the bar between 0 and 100", () => {
    expect(circleGoalPercent(4, 10)).toBe(40);
    expect(circleGoalPercent(14, 10)).toBe(100);
    expect(circleGoalPercent(0, 10)).toBe(0);
    expect(circleGoalPercent(3, 0)).toBe(0);
  });
  it("says one calm thing about the goal", () => {
    expect(circleGoalLine({ state: "open", ...base }, now)).toBe(copy.circleGoal.open(4, 10, 3));
    expect(circleGoalLine({ state: "open", ...base, moved: 11, reached: true }, now)).toBe(copy.circleGoal.reached(11, 10));
    expect(circleGoalLine({ state: "ended", ...base }, now)).toBe(copy.circleGoal.ended(4, 10));
    expect(circleGoalLine({ state: "ended", ...base, let_go: true }, now)).toBe(copy.circleGoal.letGoDone(4));
    // a goal reached and later let go still reads as reached
    expect(circleGoalLine({ state: "ended", ...base, reached: true, let_go: true }, now)).toBe(copy.circleGoal.reached(4, 10));
  });
});
