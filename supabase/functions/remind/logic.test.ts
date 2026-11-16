import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildReminder,
  FILES_PER_CALL,
  REMINDER_TEXT,
  runReminders,
  runRetention,
  runWaitingKeyRequests,
  type Deps,
  type ExpiredProof,
  type WaitingDeps,
} from "./logic.ts";
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

describe("proof retention (D48)", () => {
  const U = "33333333-3333-4333-8333-333333333333";
  const OTHER = "44444444-4444-4444-8444-444444444444";
  const file = (id: string, path: string | null, user = U): ExpiredProof => ({ id, user_id: user, storage_path: path });
  function retention(expired: ExpiredProof[], refuse: (paths: string[]) => boolean = () => false) {
    const removed: string[][] = [];
    const deleted: string[][] = [];
    const order: string[] = [];
    return {
      removed,
      deleted,
      order,
      d: {
        claimExpired: async () => expired,
        async removeFiles(paths: string[]) {
          order.push("files");
          if (refuse(paths)) throw new Error("storage said no");
          removed.push(paths);
        },
        async deleteRows(ids: string[]) {
          order.push("rows");
          deleted.push(ids);
          return ids.length;
        },
      },
    };
  }

  it("removes files first, then the rows, written notes included", async () => {
    const r = retention([file("p1", `${U}/a.jpg`), file("p2", `${U}/b.webm`), file("t1", null)]);
    assert.deepEqual(await runRetention(r.d), { files: 2, proofs: 3, held: 0 });
    assert.deepEqual(r.removed, [[`${U}/a.jpg`, `${U}/b.webm`]]);
    assert.deepEqual([...r.deleted[0]].sort(), ["p1", "p2", "t1"]);
    assert.deepEqual(r.order, ["files", "rows"]);
  });

  it("a refused batch is tried one file at a time, so one odd name holds back only itself", async () => {
    const many = Array.from({ length: FILES_PER_CALL }, (_, i) => file(`p${i}`, `${U}/${i}.jpg`));
    const r = retention(many, (paths) => paths.includes(`${U}/7.jpg`));
    assert.deepEqual(await runRetention(r.d), { files: FILES_PER_CALL - 1, proofs: FILES_PER_CALL - 1, held: 1 });
    assert.ok(!r.deleted[0].includes("p7"));
  });

  it("removes files in folders inside the owner's own folder too", async () => {
    const r = retention([file("n1", `${U}/2026/a.jpg`)]);
    assert.deepEqual(await runRetention(r.d), { files: 1, proofs: 1, held: 0 });
  });

  it("never removes a file outside its owner's folder: such a row goes, the file stays", async () => {
    const r = retention([
      file("x1", `${OTHER}/their.jpg`),
      file("x2", `${U}/../${OTHER}/their.jpg`),
      file("x3", "no-folder.jpg"),
      file("x4", `${U}//double.jpg`),
    ]);
    assert.deepEqual(await runRetention(r.d), { files: 0, proofs: 4, held: 0 });
    assert.deepEqual(r.removed, []);
    assert.deepEqual([...r.deleted[0]].sort(), ["x1", "x2", "x3", "x4"]);
  });

  it("odd rows can't hold up everyone else's: they are cleared in the same run", async () => {
    const odd = Array.from({ length: 150 }, (_, i) => file(`o${i}`, `${OTHER}/${i}.jpg`));
    const r = retention([...odd, file("good", `${U}/a.jpg`)]);
    const out = await runRetention(r.d);
    assert.equal(out.files, 1);
    assert.equal(out.proofs, 151);
  });

  it("does nothing when nothing is past its time", async () => {
    const r = retention([]);
    assert.deepEqual(await runRetention(r.d), { files: 0, proofs: 0, held: 0 });
    assert.deepEqual(r.order, []);
  });

  it("the claim is the server's only, lists files before notes and says whose they are (0033)", () => {
    const sql = readFileSync(new URL("../../migrations/0033_proof_retention.sql", import.meta.url), "utf8");
    assert.match(sql, /returns table \(id uuid, user_id uuid, storage_path text\)/);
    assert.match(sql, /order by \(p\.storage_path is null\), p\.server_created_at/);
    assert.match(sql, /grant execute on function public\.claim_expired_proofs\(int\), public\.delete_expired_proofs\(uuid\[\]\) to service_role;/);
  });
});
