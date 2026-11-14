import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReminder, REMINDER_TEXT, runReminders, type Deps } from "./logic.ts";
import { copy } from "../../../packages/shared/src/copy.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const subs: Record<string, string[]> = { [A]: ["a-phone", "a-laptop"], [B]: ["b-phone"] };

function deps(due: { user_id: string; slot: "morning" | "evening" }[]) {
  const sent: { to: string; payload: string }[] = [];
  const d: Deps = {
    claimDue: async () => due,
    subscriptionsOf: async (u) => (subs[u] ?? []).map((id) => ({ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "k", auth: "a" })),
    send: async (s, payload) => void sent.push({ to: s.id, payload }),
    remove: async () => {},
  };
  return { d, sent };
}

describe("reminders", () => {
  it("sends each due reminder to every browser of that person", async () => {
    const { d, sent } = deps([
      { user_id: A, slot: "morning" },
      { user_id: B, slot: "evening" },
    ]);
    assert.deepEqual(await runReminders(d), { sent: 3, removed: 0, failed: 0, people: 2 });
    assert.deepEqual(
      sent.map((s) => [s.to, JSON.parse(s.payload).title]),
      [
        ["a-phone", REMINDER_TEXT.morning.title],
        ["a-laptop", REMINDER_TEXT.morning.title],
        ["b-phone", REMINDER_TEXT.evening.title],
      ],
    );
  });

  it("does nothing when nothing is due", async () => {
    const { d, sent } = deps([]);
    assert.deepEqual(await runReminders(d), { sent: 0, removed: 0, failed: 0, people: 0 });
    assert.equal(sent.length, 0);
  });

  it("a reminder opens Today and replaces the same slot's earlier one", () => {
    const r = buildReminder("evening", "2026-11-15");
    assert.equal(r.url, "today");
    assert.equal(r.tag, "reminder-evening-2026-11-15");
    assert.deepEqual(Object.keys(r).sort(), ["body", "tag", "title", "url"]);
  });

  it("the words are the ones in copy.ts", () => {
    assert.deepEqual(REMINDER_TEXT, copy.push.reminders);
  });
});
