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
