import type { ItemStatus } from "./types";

/**
 * Points rules. MUST stay in sync with public.review_day() in
 * supabase/migrations/0002_functions.sql. Tests in scoring.test.ts.
 */
export const POINTS = {
  done: 10,
  partial: 5,
  fullDayBonus: 10,
} as const;

export const MAX_POINT_STAKE = 50;

/** Points for one kind act on a day when something didn't happen. Mirrors public.log_kind_act() (0011). */
export const KIND_ACT_POINTS = 5;

export interface DayScore {
  itemPoints: number;
  fullDayBonus: number;
  stakeRefund: number;
  /** 0..1 — share of countable items completed (partial = half). */
  completion: number;
  total: number;
}

export function scoreDay(statuses: ItemStatus[], stake = 0): DayScore {
  const countable = statuses.filter((s) => s !== "rescheduled");
  const done = countable.filter((s) => s === "done").length;
  const partial = countable.filter((s) => s === "partial").length;
  const completion = countable.length === 0 ? 1 : (done + 0.5 * partial) / countable.length;
  const itemPoints = done * POINTS.done + partial * POINTS.partial;
  const fullDayBonus = countable.length > 0 && done === countable.length ? POINTS.fullDayBonus : 0;
  const stakeRefund = Math.floor(stake * completion);
  return { itemPoints, fullDayBonus, stakeRefund, completion, total: itemPoints + fullDayBonus + stakeRefund };
}
