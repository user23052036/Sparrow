// Pure logic for the remind Edge Function (D38, ROADMAP T2.2), testable with `node --test`.
import { deliver, type Delivery, type Tally } from "../_shared/push.ts";

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
