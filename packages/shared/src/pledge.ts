/**
 * Charity pledge rules (practice mode, D25). Mirrors public.set_pledge() / _pledge_limit() /
 * _settle_pledge() in supabase/migrations/0013_pledges.sql. No money moves in this version.
 */
export const PLEDGE_MAX = 100;
export const PLEDGE_FIRST_LIMIT = 20;
export const CURRENCY_SYMBOL = "₹";

/** Most that can be pledged today, given the biggest pledge of the last 14 days (null if none). */
export function pledgeLimit(biggestRecent: number | null): number {
  if (biggestRecent == null) return PLEDGE_FIRST_LIMIT;
  return Math.min(PLEDGE_MAX, Math.max(PLEDGE_FIRST_LIMIT, 2 * biggestRecent));
}

/** How a pledge settles when the day is reviewed: in proportion to what was done. */
export function settlePledge(amount: number, completion: number): { kept: number; owed: number } {
  const kept = Math.floor(amount * Math.min(1, Math.max(0, completion)));
  return { kept, owed: amount - kept };
}

export interface Charity {
  id: string;
  name: string;
  blurb: string | null;
}

export interface Pledge {
  id: string;
  plan_id: string;
  charity_id: string;
  amount: number;
  mode: "practice";
  status: "set" | "cleared" | "owed";
  owed: number;
}
