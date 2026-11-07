import { copy } from "./copy";
import type { PartnerEventKind } from "./types";

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
