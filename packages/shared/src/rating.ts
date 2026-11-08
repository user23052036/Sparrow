/** Answer of public.my_rating() / partner_rating() (0015). Ratings are opt-in and never a public ranking. */
export interface Rating {
  reliability: number | null; // 1 to 5, null until enough days
  support: number | null; // 1 to 5, null until the person has had a partner
  days_counted: number;
  days_needed: number;
  shared: boolean;
  name?: string;
}

export type PartnerRating = { shared: false } | (Rating & { shared: true; name: string });

export interface LeaderRow {
  rank: number;
  handle: string;
  days: number;
  me: boolean;
}

export type Leaderboard =
  | { state: "not_joined" }
  | { state: "waiting"; needed: number; have: number }
  | {
      state: "ready";
      participants: number;
      top: LeaderRow[];
      band: "top10" | "top_quarter" | "top_half" | "keep_going" | "none";
      my_days: number;
      handle: string | null;
    };

const HANDLE = /^[A-Za-z0-9_]{3,20}$/;
export function validHandle(h: string): boolean {
  return HANDLE.test(h);
}

/** Stars as text, e.g. 3.5 -> "3.5 / 5". Kept as plain text so it reads well with screen readers. */
export function ratingText(n: number): string {
  return `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)} / 5`;
}
