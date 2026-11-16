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

/** A proof past its owner's chosen time (claim_expired_proofs, migration 0033). */
export interface ExpiredProof {
  id: string;
  storage_path: string | null;
}

export interface RetentionDeps {
  claimExpired(): Promise<ExpiredProof[]>;
  /** Removes files from the private proofs bucket through the Storage API; rejects when it couldn't. */
  removeFiles(paths: string[]): Promise<void>;
  /** delete_expired_proofs(): removes the rows, answers how many went. */
  deleteRows(ids: string[]): Promise<number>;
}

/** Files live in their owner's folder (0018, 0032): "<user id>/<name>". Nothing else is ever removed. */
const PROOF_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]+$/;
/** How many files one Storage API call removes. */
export const FILES_PER_CALL = 100;

/**
 * Proof retention (D48): files first, then rows, as account deletion does (D20). A batch of files that can't be
 * removed keeps its rows, so the next run tries again; a row is never removed while its file may still be there.
 */
export async function runRetention(deps: RetentionDeps): Promise<{ files: number; proofs: number; held: number }> {
  const expired = await deps.claimExpired();
  const gone = expired.filter((p) => p.storage_path === null).map((p) => p.id);
  const withFile = expired.filter((p) => p.storage_path !== null);
  let files = 0;
  let held = withFile.filter((p) => !PROOF_FILE.test(p.storage_path!)).length;
  const safe = withFile.filter((p) => PROOF_FILE.test(p.storage_path!));
  for (let i = 0; i < safe.length; i += FILES_PER_CALL) {
    const batch = safe.slice(i, i + FILES_PER_CALL);
    try {
      await deps.removeFiles(batch.map((p) => p.storage_path!));
      files += batch.length;
      gone.push(...batch.map((p) => p.id));
    } catch {
      held += batch.length;
    }
  }
  const proofs = gone.length ? await deps.deleteRows(gone) : 0;
  return { files, proofs, held };
}
