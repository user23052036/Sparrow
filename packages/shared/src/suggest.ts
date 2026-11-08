import { LIGHT_DAY_MAX_TASKS, NORMAL_MAX_TASKS, isLowMood } from "./safety";

/**
 * Rule-based "how many things today?" suggestion. Pure and explainable on purpose: no model,
 * no hidden tuning. It only ever suggests; the person picks. Rules (newest 7 reviewed days):
 * - no history yet: 3
 * - most of it got done (>= 80%): one more than usual
 * - about half or more (50-80%): the usual number
 * - less than half: one fewer than usual
 * - a low morning mood or a lighter day: at most 2
 * Always between 1 and 5.
 */
export const SUGGEST_LOOKBACK_DAYS = 7;
export const SUGGEST_DEFAULT = 3;

export interface RecentDay {
  date: string; // YYYY-MM-DD
  /** Countable items that day (moved items are not counted). */
  planned: number;
  /** 0..1, partly done counts half. */
  completion: number;
}

export type SuggestReason = "start" | "stretch" | "steady" | "smaller" | "mood" | "light";

export interface Suggestion {
  count: number;
  reason: SuggestReason;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function suggestTaskCount(days: RecentDay[], opts: { mood?: number | null; lightDay?: boolean } = {}): Suggestion {
  const recent = [...days]
    .filter((d) => d.planned > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, SUGGEST_LOOKBACK_DAYS);
  let count = SUGGEST_DEFAULT;
  let reason: SuggestReason = "start";
  if (recent.length > 0) {
    const usual = Math.round(recent.reduce((s, d) => s + d.planned, 0) / recent.length);
    const share = recent.reduce((s, d) => s + Number(d.completion), 0) / recent.length;
    if (share >= 0.8) [count, reason] = [usual + 1, "stretch"];
    else if (share >= 0.5) [count, reason] = [usual, "steady"];
    else [count, reason] = [usual - 1, "smaller"];
  }
  count = clamp(count, 1, NORMAL_MAX_TASKS);
  if (opts.lightDay && count > LIGHT_DAY_MAX_TASKS) [count, reason] = [LIGHT_DAY_MAX_TASKS, "light"];
  else if (isLowMood(opts.mood) && count > LIGHT_DAY_MAX_TASKS) [count, reason] = [LIGHT_DAY_MAX_TASKS, "mood"];
  return { count, reason };
}

/** Builds RecentDay rows from reviewed plans and their items (as the web app already loads them). */
export function recentDaysFrom(
  plans: { id: string; date: string; reviewed_at: string | null }[],
  items: { daily_plan_id: string; status: string }[],
): RecentDay[] {
  return plans
    .filter((p) => p.reviewed_at)
    .map((p) => {
      const mine = items.filter((i) => i.daily_plan_id === p.id && i.status !== "rescheduled");
      const done = mine.filter((i) => i.status === "done").length;
      const partial = mine.filter((i) => i.status === "partial").length;
      return { date: p.date, planned: mine.length, completion: mine.length ? (done + 0.5 * partial) / mine.length : 1 };
    });
}
