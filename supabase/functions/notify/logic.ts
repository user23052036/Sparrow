// Pure logic for the notify Edge Function (D38, ROADMAP T2.1), with sending and the database injected
// so it can be unit-tested with `node --test` (no Deno needed).
import { deliver, type Delivery, type Tally } from "../_shared/push.ts";
export { PUSH_ENDPOINT, type Subscription } from "../_shared/push.ts";

/** Events that show a notification to the recipient. */
export const VISIBLE_KINDS = ["key_request", "key_answer", "proof_shared"] as const;
export type VisibleKind = (typeof VISIBLE_KINDS)[number];
/** Events that only wake the person's own Sparrow extensions (D44, migration 0036); nothing is shown. */
export const SESSION_KINDS = ["session_started", "session_ended"] as const;
export const PUSH_KINDS = [...VISIBLE_KINDS, ...SESSION_KINDS] as const;
export type PushKind = (typeof PUSH_KINDS)[number];
/** After these the recipient's extensions check their focus state at once: an approved key ends the session. */
export const SYNC_KINDS: readonly PushKind[] = ["key_answer", "session_started", "session_ended"];
/** All a silent push says. The extension asks the database for everything else. */
export const SYNC_PAYLOAD = JSON.stringify({ sync: true });

/**
 * The only words a notification ever carries. Mirrors copy.push in packages/shared/src/copy.ts (logic.test.ts
 * pins them). Nothing a person wrote (task titles, reasons, proof text, names) is ever put in a notification:
 * a lock screen is not private.
 */
export const PUSH_TEXT = {
  key_request: {
    title: "Your partner is asking for the key",
    body: "They'd like to end a locked focus session early. Open Sparrow to answer.",
  },
  key_answer: { title: "Your partner answered", body: "Open Sparrow to see their answer." },
  proof_shared: { title: "Your partner shared a proof", body: "Open Sparrow to have a look." },
  letOut: "Let them out",
  keepGoing: "Keep going",
} as const;

export interface PushPayload {
  title: string;
  body: string;
  /** Path inside the app, relative to its base (the service worker resolves it). */
  url: string;
  tag: string;
  actions?: { action: string; title: string }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A guest's key link secret (D39, migration 0030). */
export const GUEST_KEY = /^spg_[0-9a-f]{64}$/;
/** A phone's device secret (migration 0020: two random UUIDs without dashes). */
export const DEVICE_SECRET = /^[0-9a-f]{64}$/;

export interface NotifyRequest {
  kind: PushKind;
  ref: string;
  /** Set when a guest partner caused the event: their key is their only permission. */
  guestKey?: string;
  /** Set when a key holder answered from their phone's notification (D46): the phone's own credential. */
  device?: { id: string; secret: string };
}

export function parseRequest(body: unknown): NotifyRequest | null {
  const b = body as { kind?: unknown; ref?: unknown; key?: unknown; device?: unknown } | null;
  if (!b || typeof b.kind !== "string" || typeof b.ref !== "string") return null;
  if (!(PUSH_KINDS as readonly string[]).includes(b.kind) || !UUID.test(b.ref)) return null;
  if (b.device !== undefined) {
    // A phone, like a guest, can only cause an answer to a key request; never both credentials at once.
    const d = b.device as { id?: unknown; secret?: unknown } | null;
    if (b.key !== undefined || b.kind !== "key_answer" || !d || typeof d.id !== "string" || typeof d.secret !== "string") return null;
    if (!UUID.test(d.id) || !DEVICE_SECRET.test(d.secret)) return null;
    return { kind: "key_answer", ref: b.ref, device: { id: d.id, secret: d.secret } };
  }
  if (b.key === undefined) return { kind: b.kind as PushKind, ref: b.ref };
  // A guest can only cause an answer to a key request.
  if (typeof b.key !== "string" || !GUEST_KEY.test(b.key) || b.kind !== "key_answer") return null;
  return { kind: "key_answer", ref: b.ref, guestKey: b.key };
}

/** Who the database says should hear about an event (claim_push / claim_guest_push, migration 0030). */
export interface Recipient {
  to: "user" | "guest";
  id: string;
}

/** A guest has no account, so their notifications open the key page (it remembers their key) instead of Partner. */
export function buildPayload(kind: VisibleKind, ref: string, to: Recipient["to"] = "user"): PushPayload {
  const t = PUSH_TEXT[kind];
  if (kind === "key_request")
    return {
      ...t,
      url: to === "guest" ? `key?request=${ref}` : `partner?request=${ref}`,
      tag: `key-${ref}`,
      actions: [
        { action: "let-out", title: PUSH_TEXT.letOut },
        { action: "keep-going", title: PUSH_TEXT.keepGoing },
      ],
    };
  if (kind === "key_answer") return { ...t, url: "focus", tag: `answer-${ref}` };
  return { ...t, url: to === "guest" ? "key" : "partner", tag: `proof-${ref}` };
}

export interface Deps extends Delivery {
  /** Asks the database, as the caller, who should hear about this event; null means nobody. */
  claim(kind: PushKind, ref: string): Promise<Recipient | null>;
  /** The browsers of a guest partner (push_subscriptions.guest_key_id). */
  guestSubscriptionsOf(guestId: string): Promise<Subscription[]>;
  /** A person's Sparrow extensions (push_subscriptions.silent); `subscriptionsOf` never includes them. */
  extensionsOf(userId: string): Promise<Subscription[]>;
}

const isVisible = (kind: PushKind): kind is VisibleKind => (VISIBLE_KINDS as readonly string[]).includes(kind);

/** Claims the event, then sends to every browser of the recipient and wakes their extensions when the session may have changed. */
export async function notify(kind: PushKind, ref: string, deps: Deps): Promise<Tally> {
  const tally: Tally = { sent: 0, removed: 0, failed: 0 };
  const target = await deps.claim(kind, ref);
  if (!target) return tally;
  if (isVisible(kind)) {
    const delivery = target.to === "guest" ? { ...deps, subscriptionsOf: deps.guestSubscriptionsOf } : deps;
    await deliver(target.id, JSON.stringify(buildPayload(kind, ref, target.to)), delivery, tally);
  }
  if (target.to === "user" && SYNC_KINDS.includes(kind)) await deliver(target.id, SYNC_PAYLOAD, { ...deps, subscriptionsOf: deps.extensionsOf }, tally);
  return tally;
}

/**
 * Whether the database refused the caller rather than failing: a guest key or a phone's secret that is no longer
 * valid (28000, from _guest_by_secret in 0030 and _device_by_secret in 0032). The function answers 403 for these.
 */
export function isRefusal(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "28000";
}
