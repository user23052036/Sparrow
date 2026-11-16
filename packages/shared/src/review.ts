import { copy } from "./copy";
import type { ItemStatus, PlanItem } from "./types";

/** Where the evening review starts: what was marked during the day, and "didn't happen" for the rest. */
export function reviewStartStatuses(items: Pick<PlanItem, "id" | "status">[]): Record<string, ItemStatus> {
  return Object.fromEntries(items.map((i) => [i.id, i.status === "pending" ? "missed" : i.status]));
}

/** What review_day() answers. */
export interface ReviewResult {
  total: number;
  done: number;
  countable: number;
  full_day_bonus: number;
}

/** The kind sentence after closing a day, with the points it brought. */
export function reviewMessage(r: ReviewResult, isToday: boolean): string {
  const line =
    r.full_day_bonus > 0
      ? copy.fullDay
      : r.done < r.countable && isToday
        ? `${copy.partialWin(r.done, r.countable)} ${copy.oneSmallWin}`
        : copy.partialWin(r.done, r.countable);
  return copy.reviewPoints(line, r.total);
}

/** Bytes from base64 (the phone's image tools hand photos over this way). Throws on anything else. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) throw new Error("not base64");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const body = clean.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((body.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let j = 0;
  for (const ch of body) {
    value = (value << 6) | alphabet.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (value >> bits) & 0xff;
    }
  }
  return out;
}
