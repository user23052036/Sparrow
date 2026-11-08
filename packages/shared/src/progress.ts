import { copy } from "./copy";

/** Keys returned by public.my_progress() (migration 0012). Order is the display order. */
export const BADGE_KEYS = ["first_plan", "first_full_day", "run_3", "run_7", "first_proof", "first_focus", "first_kind_act", "helped_partner"] as const;
export type BadgeKey = (typeof BADGE_KEYS)[number];

export interface MoodPoint {
  date: string;
  morning: number | null;
  evening: number | null;
}

export interface Progress {
  badges: string[];
  best_run: number;
  helping_days: number;
  kind_acts: number;
  mood: MoodPoint[];
  balance: number;
}

/** Word for a 1..5 mood value (Heavy to Bright), or null. */
export function moodWord(v: number | null | undefined): string | null {
  if (v == null || v < 1 || v > 5) return null;
  return copy.moods[v - 1];
}

/** Badges split into earned and not-yet, keeping display order and ignoring keys this app doesn't know. */
export function splitBadges(earned: string[]): { earned: BadgeKey[]; notYet: BadgeKey[] } {
  const have = new Set(earned);
  return { earned: BADGE_KEYS.filter((k) => have.has(k)), notYet: BADGE_KEYS.filter((k) => !have.has(k)) };
}
