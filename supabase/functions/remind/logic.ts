// Pure logic for the remind Edge Function (D38, ROADMAP T2.2), testable with `node --test`.
import { deliver, type Delivery, type Subscription, type Tally } from "../_shared/push.ts";
import { buildPayload } from "../notify/logic.ts";

export type Slot = "morning" | "evening";

/** The only words a reminder carries. Mirrors copy.push.reminders in packages/shared/src/copy.ts (logic.test.ts pins them). */
export const REMINDER_TEXT = {
  morning: { title: "Good morning", body: "What's one small thing for today? Open Sparrow to plan it." },
  evening: { title: "How did today go?", body: "Close the day in Sparrow when you're ready. Partly done counts." },
} as const;

export function buildReminder(slot: Slot, localDay = new Date().toISOString().slice(0, 10)) {
  return { ...REMINDER_TEXT[slot], url: "today", tag: `reminder-${slot}-${localDay}` };
}

export interface Deps extends Delivery {
  /** claim_due_reminders(): the reminders due now, already marked as sent. */
  claimDue(): Promise<{ user_id: string; slot: Slot }[]>;
}

export async function runReminders(deps: Deps): Promise<Tally & { people: number }> {
  const due = await deps.claimDue();
  const tally: Tally = { sent: 0, removed: 0, failed: 0 };
  for (const r of due) {
    // One person's trouble (a database hiccup) must not cost everyone after them their reminder.
    try {
      await deliver(r.user_id, JSON.stringify(buildReminder(r.slot)), deps, tally);
    } catch {
      tally.failed++;
    }
  }
  return { ...tally, people: due.length };
}

/** A key request that waited through the key holder's quiet hours (claim_waiting_key_requests, migration 0031). */
export interface WaitingRequest {
  to_kind: "user" | "guest";
  recipient: string;
  request_id: string;
}

export interface WaitingDeps extends Delivery {
  claimWaiting(): Promise<WaitingRequest[]>;
  /** The browsers of a guest partner (push_subscriptions.guest_key_id). */
  guestSubscriptionsOf(guestId: string): Promise<Subscription[]>;
}

/** Sends each waiting key request as the same notification the asker's app would have sent (D43). */
export async function runWaitingKeyRequests(deps: WaitingDeps): Promise<Tally & { requests: number }> {
  const waiting = await deps.claimWaiting();
  const tally: Tally = { sent: 0, removed: 0, failed: 0 };
  for (const w of waiting) {
    const delivery = w.to_kind === "guest" ? { ...deps, subscriptionsOf: deps.guestSubscriptionsOf } : deps;
    try {
      await deliver(w.recipient, JSON.stringify(buildPayload("key_request", w.request_id, w.to_kind)), delivery, tally);
    } catch {
      tally.failed++;
    }
  }
  return { ...tally, requests: waiting.length };
}
