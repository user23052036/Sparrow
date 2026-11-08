/**
 * M7 safety rules: how the day gets smaller when someone is struggling.
 * Pure functions so the web app, tests and (later) the Android app agree.
 * The database enforces the light-day cap too (0006_light_day.sql); keep
 * LIGHT_DAY_MAX_TASKS in sync with commit_day().
 */
export const NORMAL_MAX_TASKS = 5;
export const LIGHT_DAY_MAX_TASKS = 2;
/** A day below this completion share counts as a heavy day. */
export const HEAVY_DAY_BELOW = 0.34;
export const HEAVY_STRETCH_DAYS = 3;
/** Moods at or below this (1 = Heavy, 2 = Low) offer a smaller day. */
export const LOW_MOOD_AT_OR_BELOW = 2;

export function isLowMood(mood: number | null | undefined): boolean {
  return typeof mood === "number" && mood <= LOW_MOOD_AT_OR_BELOW;
}

export interface DayCompletion {
  date: string; // YYYY-MM-DD
  completion: number; // 0..1
}

const DAY_MS = 86_400_000;
const dayNumber = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);

/**
 * True when the last HEAVY_STRETCH_DAYS reviewed days were consecutive calendar
 * days and each was a heavy day. Gaps (days with no review) break the stretch,
 * so a long break never reads as "three hard days in a row".
 * Accepts rows in any order.
 */
export function isHeavyStretch(rows: DayCompletion[]): boolean {
  if (rows.length < HEAVY_STRETCH_DAYS) return false;
  const latest = [...rows]
    .sort((a, b) => dayNumber(b.date) - dayNumber(a.date))
    .slice(0, HEAVY_STRETCH_DAYS);
  const consecutive = latest.every((r, i) => i === 0 || dayNumber(latest[i - 1].date) - dayNumber(r.date) === 1);
  return consecutive && latest.every((r) => Number(r.completion) < HEAVY_DAY_BELOW);
}

export interface DayShape {
  maxTasks: number;
  showStake: boolean;
  /** Offer (never force) a smaller day. */
  offerLightDay: boolean;
}

/**
 * How the morning screen should look.
 * - lightDay: the user already chose a lighter day (stored in profiles.light_day).
 * - Low mood or a heavy stretch only *offer* it; the user decides.
 */
export function dayShape(opts: { mood: number | null; gentle: boolean; lightDay: boolean; heavyStretch: boolean }): DayShape {
  const offerLightDay = !opts.lightDay && (isLowMood(opts.mood) || opts.heavyStretch);
  return {
    maxTasks: opts.lightDay ? LIGHT_DAY_MAX_TASKS : NORMAL_MAX_TASKS,
    showStake: !opts.gentle && !opts.lightDay,
    offerLightDay,
  };
}

/** Keep the first two when someone switches to a lighter day with more picked. */
export function trimToLight<T>(picked: T[]): T[] {
  return picked.slice(0, LIGHT_DAY_MAX_TASKS);
}

/** YYYY-MM-DD for the calendar day after `date` (no time zone maths needed). */
export function nextDay(date: string): string {
  return new Date(dayNumber(date) * DAY_MS + DAY_MS).toISOString().slice(0, 10);
}
