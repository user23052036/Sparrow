import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPayload, notify, parseRequest, PUSH_ENDPOINT, PUSH_TEXT, type Deps, type Subscription } from "./logic.ts";
import { copy } from "../../../packages/shared/src/copy.ts";

const REF = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const sub = (id: string, endpoint = `https://fcm.googleapis.com/fcm/send/${id}`): Subscription => ({
  id,
  endpoint,
  p256dh: "k".repeat(87),
  auth: "a".repeat(22),
});

function deps(over: Partial<Deps> & { failures?: Record<string, number> } = {}) {
  const sentTo: string[] = [];
  const removed: string[] = [];
  const payloads: string[] = [];
  const d: Deps = {
    claim: async () => PARTNER,
    subscriptionsOf: async () => [sub("phone"), sub("laptop"), sub("old")],
    async send(s, payload) {
      const code = over.failures?.[s.id];
      if (code) throw Object.assign(new Error("push service said no"), { statusCode: code });
      sentTo.push(s.id);
      payloads.push(payload);
    },
    remove: async (id) => void removed.push(id),
    ...over,
  };
  return { d, sentTo, removed, payloads };
}

describe("notify", () => {
  it("sends to every browser of the person the database names", async () => {
    const { d, sentTo } = deps();
    assert.deepEqual(await notify("key_request", REF, d), { sent: 3, removed: 0, failed: 0 });
    assert.deepEqual(sentTo, ["phone", "laptop", "old"]);
  });

  it("sends nothing when the database says nobody should hear about it", async () => {
    let looked = false;
    const { d, sentTo } = deps({
      claim: async () => null,
      subscriptionsOf: async () => {
        looked = true;
        return [];
      },
    });
    assert.deepEqual(await notify("proof_shared", REF, d), { sent: 0, removed: 0, failed: 0 });
    assert.equal(looked, false, "no subscriptions are read without a claim");
    assert.deepEqual(sentTo, []);
  });

  it("forgets browsers the push service says are gone, and keeps going after other errors", async () => {
    const { d, sentTo, removed } = deps({ failures: { old: 410, laptop: 500 } });
    assert.deepEqual(await notify("key_answer", REF, d), { sent: 1, removed: 1, failed: 1 });
    assert.deepEqual(sentTo, ["phone"]);
    assert.deepEqual(removed, ["old"]);
  });

  it("never sends to an address that isn't a browser push service", async () => {
    const { d, sentTo } = deps({ subscriptionsOf: async () => [sub("phone"), sub("odd", "https://internal.example.com/hook")] });
    assert.deepEqual(await notify("key_answer", REF, d), { sent: 1, removed: 0, failed: 1 });
    assert.deepEqual(sentTo, ["phone"]);
  });

  it("knows the real push services and refuses look-alikes", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/x",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://web.push.apple.com/x",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
    ])
      assert.ok(PUSH_ENDPOINT.test(ok), ok);
    for (const bad of [
      "http://fcm.googleapis.com/x",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evil.example.com/fcm.googleapis.com/",
      "https://push.apple.com.evil/x",
    ])
      assert.ok(!PUSH_ENDPOINT.test(bad), bad);
  });

  it("puts nothing a person wrote into the message", async () => {
    const { d, payloads } = deps();
    await notify("key_request", REF, d);
    const p = JSON.parse(payloads[0]);
    assert.deepEqual(Object.keys(p).sort(), ["actions", "body", "tag", "title", "url"]);
    assert.equal(p.title, PUSH_TEXT.key_request.title);
  });
});

describe("payloads", () => {
  it("a key request opens the request with the two answers as buttons", () => {
    const p = buildPayload("key_request", REF);
    assert.equal(p.url, `partner?request=${REF}`);
    assert.deepEqual(
      p.actions?.map((a) => a.action),
      ["let-out", "keep-going"],
    );
  });
  it("answers open Focus and shared proofs open Partner, with no buttons", () => {
    assert.equal(buildPayload("key_answer", REF).url, "focus");
    assert.equal(buildPayload("proof_shared", REF).url, "partner");
    assert.equal(buildPayload("proof_shared", REF).actions, undefined);
  });
  it("requests are checked before anything happens", () => {
    assert.deepEqual(parseRequest({ kind: "key_answer", ref: REF }), { kind: "key_answer", ref: REF });
    for (const bad of [null, {}, { kind: "key_answer" }, { kind: "everything", ref: REF }, { kind: "key_answer", ref: "1; drop table" }]) {
      assert.equal(parseRequest(bad), null);
    }
  });
});

describe("the push-service check matches migration 0028", () => {
  it("the table and the function accept the same addresses", () => {
    const sql = readFileSync(new URL("../../migrations/0028_web_push.sql", import.meta.url), "utf8");
    assert.ok(sql.includes(PUSH_ENDPOINT.source.replace(/\\\//g, "/")), "the regex in 0028 differs from PUSH_ENDPOINT");
  });
});

describe("the words match copy.ts", () => {
  it("every notification text is the one in copy.push", () => {
    assert.deepEqual(PUSH_TEXT, copy.push.notification);
  });
});
