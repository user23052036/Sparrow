// Pure logic for the notify Edge Function (D38, ROADMAP T2.1), with sending and the database injected
// so it can be unit-tested with `node --test` (no Deno needed).
import { deliver, type Delivery, type Tally } from "../_shared/push.ts";
export { PUSH_ENDPOINT, type Subscription } from "../_shared/push.ts";

export const PUSH_KINDS = ["key_request", "key_answer", "proof_shared"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

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

export function parseRequest(body: unknown): { kind: PushKind; ref: string } | null {
  const b = body as { kind?: unknown; ref?: unknown } | null;
  if (!b || typeof b.kind !== "string" || typeof b.ref !== "string") return null;
  if (!(PUSH_KINDS as readonly string[]).includes(b.kind) || !UUID.test(b.ref)) return null;
  return { kind: b.kind as PushKind, ref: b.ref };
}

export function buildPayload(kind: PushKind, ref: string): PushPayload {
  const t = PUSH_TEXT[kind];
  if (kind === "key_request")
    return {
      ...t,
      url: `partner?request=${ref}`,
      tag: `key-${ref}`,
      actions: [
        { action: "let-out", title: PUSH_TEXT.letOut },
        { action: "keep-going", title: PUSH_TEXT.keepGoing },
      ],
    };
  if (kind === "key_answer") return { ...t, url: "focus", tag: `answer-${ref}` };
  return { ...t, url: "partner", tag: `proof-${ref}` };
}

export interface Deps extends Delivery {
  /** Asks the database, as the caller, who should hear about this event (claim_push); null means nobody. */
  claim(kind: PushKind, ref: string): Promise<string | null>;
}

/** Claims the event, then sends to every browser of the recipient. */
export async function notify(kind: PushKind, ref: string, deps: Deps): Promise<Tally> {
  const target = await deps.claim(kind, ref);
  if (!target) return { sent: 0, removed: 0, failed: 0 };
  return deliver(target, JSON.stringify(buildPayload(kind, ref)), deps);
}
