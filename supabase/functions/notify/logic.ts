// Pure logic for the notify Edge Function (D38, ROADMAP T2.1), with sending and the database injected
// so it can be unit-tested with `node --test` (no Deno needed).

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

/** The browsers' own push services. Mirrors the check on push_subscriptions.endpoint (0028; pinned by logic.test.ts). */
export const PUSH_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)\//;

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

export interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}
export interface Deps {
  /** Asks the database, as the caller, who should hear about this event (claim_push); null means nobody. */
  claim(kind: PushKind, ref: string): Promise<string | null>;
  subscriptionsOf(userId: string): Promise<Subscription[]>;
  /** Sends one encrypted push; rejects with an error that has `statusCode` when the push service says no. */
  send(sub: Subscription, payload: string): Promise<void>;
  remove(subscriptionId: string): Promise<void>;
}

/** Claims the event, then sends to every browser of the recipient. Gone browsers (404/410) are forgotten. */
export async function notify(kind: PushKind, ref: string, deps: Deps): Promise<{ sent: number; removed: number; failed: number }> {
  const target = await deps.claim(kind, ref);
  if (!target) return { sent: 0, removed: 0, failed: 0 };
  const payload = JSON.stringify(buildPayload(kind, ref));
  let sent = 0,
    removed = 0,
    failed = 0;
  for (const sub of await deps.subscriptionsOf(target)) {
    // Never send anywhere but a push service, whatever is in the table.
    if (!PUSH_ENDPOINT.test(sub.endpoint)) {
      failed++;
      continue;
    }
    try {
      await deps.send(sub, payload);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await deps.remove(sub.id);
        removed++;
      } else failed++;
    }
  }
  return { sent, removed, failed };
}
