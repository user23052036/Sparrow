import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReminder, REMINDER_TEXT, runReminders, runWaitingKeyRequests, type Deps, type WaitingDeps } from "./logic.ts";
import { PUSH_TEXT } from "../notify/logic.ts";
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

  it("keeps going when one person's browsers can't be read", async () => {
    const { d, sent } = deps([
      { user_id: A, slot: "morning" },
      { user_id: B, slot: "morning" },
    ]);
    const read = d.subscriptionsOf;
    d.subscriptionsOf = async (u) => {
      if (u === A) throw new Error("database hiccup");
      return read(u);
    };
    assert.deepEqual(await runReminders(d), { sent: 1, removed: 0, failed: 1, people: 2 });
    assert.deepEqual(
      sent.map((s) => s.to),
      ["b-phone"],
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

describe("key requests that waited through quiet hours", () => {
  const REQ = "33333333-3333-4333-8333-333333333333";
  const GUEST = "44444444-4444-4444-8444-444444444444";
  function waitingDeps(waiting: Awaited<ReturnType<WaitingDeps["claimWaiting"]>>) {
    const sent: { to: string; payload: Record<string, unknown> }[] = [];
    const sub = (id: string) => ({ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "k", auth: "a" });
    const d: WaitingDeps = {
      claimWaiting: async () => waiting,
      subscriptionsOf: async (u) => (subs[u] ?? []).map(sub),
      guestSubscriptionsOf: async (g) => (g === GUEST ? [sub("guest-phone")] : []),
      send: async (s, payload) => void sent.push({ to: s.id, payload: JSON.parse(payload) }),
      remove: async () => {},
    };
    return { d, sent };
  }

  it("reaches an account partner with the usual key-request notification", async () => {
    const { d, sent } = waitingDeps([{ to_kind: "user", recipient: B, request_id: REQ }]);
    assert.deepEqual(await runWaitingKeyRequests(d), { sent: 1, removed: 0, failed: 0, requests: 1 });
    assert.equal(sent[0].to, "b-phone");
    assert.equal(sent[0].payload.title, PUSH_TEXT.key_request.title);
    assert.equal(sent[0].payload.url, `partner?request=${REQ}`);
  });

  it("reaches a guest's browsers, opening the key page", async () => {
    const { d, sent } = waitingDeps([{ to_kind: "guest", recipient: GUEST, request_id: REQ }]);
    assert.deepEqual(await runWaitingKeyRequests(d), { sent: 1, removed: 0, failed: 0, requests: 1 });
    assert.equal(sent[0].to, "guest-phone");
    assert.equal(sent[0].payload.url, `key?request=${REQ}`);
  });

  it("does nothing when nothing waits", async () => {
    const { d, sent } = waitingDeps([]);
    assert.deepEqual(await runWaitingKeyRequests(d), { sent: 0, removed: 0, failed: 0, requests: 0 });
    assert.equal(sent.length, 0);
  });
});
