import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  buildPayload,
  GUEST_KEY as GUEST_KEY_SHAPE,
  notify,
  parseRequest,
  PUSH_ENDPOINT,
  PUSH_TEXT,
  SESSION_KINDS,
  SYNC_PAYLOAD,
  type Deps,
  type Subscription,
} from "./logic.ts";
import { copy } from "../../../packages/shared/src/copy.ts";

const REF = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const GUEST = "33333333-3333-4333-8333-333333333333";
const GUEST_KEY = "spg_" + "0123456789abcdef".repeat(4);
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
    claim: async () => ({ to: "user", id: PARTNER }),
    subscriptionsOf: async () => [sub("phone"), sub("laptop"), sub("old")],
    guestSubscriptionsOf: async () => [sub("guest-phone")],
    extensionsOf: async () => [],
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

  it("a guest partner's browsers get the event, opening the key page instead of Partner", async () => {
    const asked: string[] = [];
    const { d, sentTo, payloads } = deps({
      claim: async () => ({ to: "guest", id: GUEST }),
      guestSubscriptionsOf: async (id) => {
        asked.push(id);
        return [sub("guest-phone")];
      },
    });
    assert.deepEqual(await notify("key_request", REF, d), { sent: 1, removed: 0, failed: 0 });
    assert.deepEqual(asked, [GUEST]);
    assert.deepEqual(sentTo, ["guest-phone"]);
    assert.equal(JSON.parse(payloads[0]).url, `key?request=${REF}`);
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

  it("a session started or ended elsewhere only wakes the person's extensions, with nothing in the push", async () => {
    for (const kind of SESSION_KINDS) {
      const { d, sentTo, payloads } = deps({ extensionsOf: async () => [sub("extension")] });
      assert.deepEqual(await notify(kind, REF, d), { sent: 1, removed: 0, failed: 0 });
      assert.deepEqual(sentTo, ["extension"], "no notification on the phone or laptop");
      assert.deepEqual(payloads, [SYNC_PAYLOAD]);
      assert.deepEqual(JSON.parse(SYNC_PAYLOAD), { sync: true });
    }
  });

  it("an answer to a key request also wakes the asker's extensions: an approval ends the session", async () => {
    const { d, sentTo, payloads } = deps({ extensionsOf: async () => [sub("extension")] });
    assert.deepEqual(await notify("key_answer", REF, d), { sent: 4, removed: 0, failed: 0 });
    assert.deepEqual(sentTo, ["phone", "laptop", "old", "extension"]);
    assert.equal(payloads.at(-1), SYNC_PAYLOAD);
  });

  it("requests and proofs don't wake anyone's extensions, and a guest has none", async () => {
    for (const kind of ["key_request", "proof_shared"] as const) {
      const { d, sentTo } = deps({ extensionsOf: async () => [sub("extension")] });
      await notify(kind, REF, d);
      assert.ok(!sentTo.includes("extension"), kind);
    }
    let asked = false;
    const { d } = deps({
      claim: async () => ({ to: "guest", id: GUEST }),
      extensionsOf: async () => {
        asked = true;
        return [];
      },
    });
    await notify("key_answer", REF, d);
    assert.equal(asked, false);
  });

  it("forgets an extension the push service says is gone", async () => {
    const { d, removed } = deps({ extensionsOf: async () => [sub("extension")], failures: { extension: 404 } });
    assert.deepEqual(await notify("session_started", REF, d), { sent: 0, removed: 1, failed: 0 });
    assert.deepEqual(removed, ["extension"]);
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
  it("a guest's key request and shared proofs open the key page; the buttons stay", () => {
    const p = buildPayload("key_request", REF, "guest");
    assert.equal(p.url, `key?request=${REF}`);
    assert.equal(p.actions?.length, 2);
    assert.equal(buildPayload("proof_shared", REF, "guest").url, "key");
  });
  it("requests are checked before anything happens", () => {
    assert.deepEqual(parseRequest({ kind: "key_answer", ref: REF }), { kind: "key_answer", ref: REF });
    assert.deepEqual(parseRequest({ kind: "session_started", ref: REF }), { kind: "session_started", ref: REF });
    for (const bad of [null, {}, { kind: "key_answer" }, { kind: "everything", ref: REF }, { kind: "key_answer", ref: "1; drop table" }]) {
      assert.equal(parseRequest(bad), null);
    }
  });
  it("a guest can only report an answer, and only with a whole key", () => {
    assert.deepEqual(parseRequest({ kind: "key_answer", ref: REF, key: GUEST_KEY }), { kind: "key_answer", ref: REF, guestKey: GUEST_KEY });
    for (const bad of [
      { kind: "key_request", ref: REF, key: GUEST_KEY },
      { kind: "proof_shared", ref: REF, key: GUEST_KEY },
      { kind: "session_started", ref: REF, key: GUEST_KEY },
      { kind: "key_answer", ref: REF, key: GUEST_KEY.slice(0, -1) },
      { kind: "key_answer", ref: REF, key: "spt_" + "0".repeat(64) },
      { kind: "key_answer", ref: REF, key: null },
    ])
      assert.equal(parseRequest(bad), null, JSON.stringify(bad));
  });
});

describe("the push-service check matches migration 0028", () => {
  it("the table and the function accept the same addresses", () => {
    const sql = readFileSync(new URL("../../migrations/0028_web_push.sql", import.meta.url), "utf8");
    assert.ok(sql.includes(PUSH_ENDPOINT.source.replace(/\\\//g, "/")), "the regex in 0028 differs from PUSH_ENDPOINT");
  });
});

describe("the guest key shape matches migration 0030", () => {
  it("the function accepts exactly the keys the database does", () => {
    const sql = readFileSync(new URL("../../migrations/0030_guest_partner.sql", import.meta.url), "utf8");
    assert.ok(sql.includes(`p_key !~ '${GUEST_KEY_SHAPE.source}'`), "the key pattern in 0030 differs from GUEST_KEY");
  });
});

describe("the session kinds match migration 0036", () => {
  it("claim_push knows every kind that wakes an extension", () => {
    const sql = readFileSync(new URL("../../migrations/0036_extension_push.sql", import.meta.url), "utf8");
    for (const kind of SESSION_KINDS) assert.ok(sql.includes(`p_kind = '${kind}'`), kind);
  });
});

describe("migration 0036 lands before 0032 to 0035 on live databases (D44)", () => {
  it("those migrations leave what 0036 defines alone, so every database ends the same", () => {
    const dir = new URL("../../migrations/", import.meta.url);
    for (const f of readdirSync(dir).filter((f) => /^003[2-5]_/.test(f))) {
      const sql = readFileSync(new URL(f, dir), "utf8");
      for (const name of ["claim_push", "save_extension_push", "save_push_subscription", "silent"])
        assert.ok(!sql.includes(name), `${f} mentions ${name}: put that change in a migration after 0036`);
    }
  });
});

describe("silent and notifying addresses stay apart where the functions read them", () => {
  it("notify reads extensions only for wake-ups and browsers only for notifications; remind never reads extensions", () => {
    const notifySrc = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    assert.match(notifySrc, /\.eq\(column, id\)\.eq\("silent", silent\)/);
    assert.match(notifySrc, /extensionsOf: \(userId\) => subscriptions\("user_id", userId, true\)/);
    assert.match(notifySrc, /subscriptionsOf: \(userId\) => subscriptions\("user_id", userId\),/);
    const remindSrc = readFileSync(new URL("../remind/index.ts", import.meta.url), "utf8");
    assert.match(remindSrc, /\.eq\(column, id\)\.eq\("silent", false\)/);
    assert.ok(!/silent", true|silent", silent/.test(remindSrc));
  });
});

describe("the words match copy.ts", () => {
  it("every notification text is the one in copy.push", () => {
    assert.deepEqual(PUSH_TEXT, copy.push.notification);
  });
});
