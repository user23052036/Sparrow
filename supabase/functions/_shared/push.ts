// Sending Web Push to one person's browsers, shared by the notify and remind functions (D38).
// The push service and the database are injected so this runs under `node --test` too.

/** The browsers' own push services. Mirrors the check on push_subscriptions.endpoint (0028; pinned by notify/logic.test.ts). */
export const PUSH_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)\//;

export interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}
export interface Delivery {
  subscriptionsOf(userId: string): Promise<Subscription[]>;
  /** Sends one encrypted push; rejects with an error that has `statusCode` when the push service says no. */
  send(sub: Subscription, payload: string): Promise<void>;
  remove(subscriptionId: string): Promise<void>;
}
export interface Tally {
  sent: number;
  removed: number;
  failed: number;
}

/** Sends to every browser of one person. Browsers the push service says are gone (404/410) are forgotten. */
export async function deliver(userId: string, payload: string, d: Delivery, tally: Tally = { sent: 0, removed: 0, failed: 0 }): Promise<Tally> {
  for (const sub of await d.subscriptionsOf(userId)) {
    // Never send anywhere but a push service, whatever is in the table.
    if (!PUSH_ENDPOINT.test(sub.endpoint)) {
      tally.failed++;
      continue;
    }
    try {
      await d.send(sub, payload);
      tally.sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await d.remove(sub.id);
        tally.removed++;
      } else tally.failed++;
    }
  }
  return tally;
}
