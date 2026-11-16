import type { PartnerEndRequest } from "./types";

/**
 * Guest partner (D39, migration 0030): a friend holds the key through a secret link, without an account.
 * The numbers below mirror the checks in create_guest_key(); a test pins them to the migration.
 */
export const GUEST_NAME_MAX = 40;
export const GUEST_KEY_PATTERN = /^spg_[0-9a-f]{64}$/;
/** Where the guest's browser remembers the key, so a notification can open the page without it in the address. */
export const GUEST_KEY_STORAGE = "sparrow:guest-key";

/** What create_guest_key() answers. The key is shown once and cannot be read again. */
export interface NewGuestKey {
  id: string;
  name: string;
  key: string;
}

/** A proof as the guest sees it: written text in full, a photo or voice note only as "there is one". */
export interface GuestProof {
  id: string;
  kind: "photo" | "text" | "voice";
  text: string | null;
  task: string;
  created_at: string;
}

/** What guest_overview() answers: the owner's name, their pending key requests and shared proofs. Nothing else. */
export interface GuestOverview {
  name: string;
  guest: string;
  pending_end_requests: PartnerEndRequest[];
  proofs: GuestProof[];
}

/** Reads a key from a bare key, a "#key" fragment or a whole key link. Null when there is none. */
export function parseGuestKey(input: string | null | undefined): string | null {
  const m = /spg_[0-9a-f]{64}(?![0-9a-f])/.exec((input ?? "").trim());
  return m && GUEST_KEY_PATTERN.test(m[0]) ? m[0] : null;
}

/** The link to send the friend. The key sits after "#", which browsers never send to the server. */
export function guestKeyUrl(origin: string, key: string): string {
  return `${origin.replace(/\/$/, "")}/key#${key}`;
}

/** Tidies a name the way the database does; null when it is empty or too long. */
export function normalizeGuestName(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  return s.length >= 1 && s.length <= GUEST_NAME_MAX ? s : null;
}
