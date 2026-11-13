import { copy } from "./copy";
import { parseInviteCode } from "./partner";

/** Mirrors the limit in supabase/migrations/0019_circles.sql (join_circle). */
export const CIRCLE_MAX_MEMBERS = 4;

/** Accepts a circle link ("…/circle/join?code=…") or the bare code; same format as partner invites. */
export const parseCircleCode = parseInviteCode;

export function circleInviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/circle/join?code=${code}`;
}

export interface CircleDay {
  planned: number;
  done: number;
  partial: number;
  closed: boolean | null;
}

/** One calm line about a member's day, from counts only (titles are never shared with a circle). */
export function circleDayLine(day: CircleDay | null, shares: boolean): string {
  if (!shares || day === null) return shares ? copy.circle.notPlanned : copy.circle.notSharing;
  if (!day.planned) return copy.circle.notPlanned;
  const moved = day.done + day.partial;
  return copy.circle.dayLine(moved, day.planned, Boolean(day.closed));
}

/** Circle goals (D37, migration 0026). The limits mirror start_circle_goal(); a test pins them. */
export const CIRCLE_GOAL_MIN = 3;
export const CIRCLE_GOAL_MAX = 100;
export const CIRCLE_GOAL_DAYS = 7;
export const CIRCLE_GOAL_PER_MEMBER = 5;

/** What circle_goal() answers: one number for the whole circle, never who moved how many. */
export type CircleGoal =
  | { state: "none"; can_start: boolean; suggested?: number }
  | {
      state: "open" | "ended";
      target: number;
      moved: number;
      reached: boolean;
      let_go: boolean;
      ends_at: string;
      can_start: boolean;
      suggested: number;
    };

export function suggestCircleGoal(members: number): number {
  return Math.min(CIRCLE_GOAL_MAX, Math.max(CIRCLE_GOAL_MIN, members * CIRCLE_GOAL_PER_MEMBER));
}

export function validCircleGoal(n: number): boolean {
  return Number.isInteger(n) && n >= CIRCLE_GOAL_MIN && n <= CIRCLE_GOAL_MAX;
}

/** Whole days left (rounded up, at least 1 while it is still open). */
export function circleGoalDaysLeft(endsAt: string, now: Date = new Date()): number {
  const ms = new Date(endsAt).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.max(1, Math.ceil(ms / 86_400_000));
}

/** How full the bar is, 0 to 100. */
export function circleGoalPercent(moved: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((moved / target) * 100)));
}

/** The one calm line under the goal. */
export function circleGoalLine(g: Extract<CircleGoal, { state: "open" | "ended" }>, now: Date = new Date()): string {
  if (g.reached) return copy.circleGoal.reached(g.moved, g.target);
  if (g.state === "open") return copy.circleGoal.open(g.moved, g.target, circleGoalDaysLeft(g.ends_at, now));
  return g.let_go ? copy.circleGoal.letGoDone(g.moved) : copy.circleGoal.ended(g.moved, g.target);
}
