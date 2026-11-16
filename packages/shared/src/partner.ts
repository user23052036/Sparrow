import { copy } from "./copy";
import type { PartnerEventKind, PartnerOverview } from "./types";

const CODE = /^[0-9a-f]{16}$/;

/** Accepts an invite link ("https://…/partner/join?code=abc…") or the bare 16-character code. */
export function parseInviteCode(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let candidate = raw;
  try {
    const url = new URL(raw);
    candidate = url.searchParams.get("code") ?? "";
  } catch {
    const m = raw.match(/[?&]code=([^&#\s]+)/);
    if (m) candidate = m[1];
  }
  candidate = candidate.trim().toLowerCase();
  return CODE.test(candidate) ? candidate : null;
}

export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/partner/join?code=${code}`;
}

/** Gentle wording for a partner's focus event. */
export function eventLabel(kind: PartnerEventKind, detail?: string | null): string {
  if (kind === "early_exit") return detail?.startsWith("partner approved") ? copy.eventApproved : copy.eventEarlyExit;
  if (kind === "heartbeat_lost") return copy.eventQuiet;
  return copy.eventDisabled;
}

/** Who holds my key: the account partner, or the friend with a key link (D39). Null when nobody does. */
export function keyHolderName(ov: PartnerOverview | null | undefined): string | null {
  if (ov?.state === "active") return ov.partner.name;
  if (ov?.state === "guest") return ov.guest.name;
  return null;
}

/** Partner fatigue guard (D43, migration 0031): the most key requests per locked session and per local day. */
export const KEY_REQUESTS_PER_SESSION = 3;
export const KEY_REQUESTS_PER_DAY = 5;

/** What key_request_status() answers, for being kind about it on the Focus page. */
export interface KeyRequestStatus {
  session_asked: number;
  session_max: number;
  day_asked: number;
  day_max: number;
  can_ask: boolean;
  /** When the key holder's quiet hours end, or null when they aren't in quiet hours. */
  quiet_until: string | null;
}

/** "22:00:00" or "22:00" → "22:00"; anything else → null. Quiet hours are whole minutes. */
export function quietTime(t: string | null | undefined): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(:00)?$/.exec(t ?? "");
  return m ? `${m[1]}:${m[2]}` : null;
}
