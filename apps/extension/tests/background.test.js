// Integration test: runs the real background.js against a fake `chrome` API and a fake Supabase server.
import { test } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------- fake chrome
const store = {};
let rules = [];
const badge = { text: "" };
const tabsUpdated = [];
let openTabs = [];
let onMessage;
const tabsCreated = [];
// Sites the person has allowed the calm page on (chrome.permissions). youtube.com is allowed.
const grantedOrigins = new Set(["*://youtube.com/*", "*://*.youtube.com/*"]);
const permissionListeners = [];

globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys ?? {});
        return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
      },
      async set(obj) {
        Object.assign(store, obj);
      },
    },
  },
  alarms: {
    async get() {
      return null;
    },
    create() {},
    async clear() {},
    onAlarm: { addListener() {} },
  },
  runtime: {
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    onMessage: {
      addListener(fn) {
        onMessage = fn;
      },
    },
    getManifest: () => ({ version: "0.1.0" }),
    getPlatformInfo: async () => ({ os: "mac" }),
    getURL: (p) => `chrome-extension://abc${p}`,
  },
  declarativeNetRequest: {
    async getDynamicRules() {
      return rules;
    },
    async updateDynamicRules({ removeRuleIds = [], addRules = [] }) {
      rules = rules.filter((r) => !removeRuleIds.includes(r.id)).concat(addRules);
    },
  },
  action: {
    async setBadgeText({ text }) {
      badge.text = text;
    },
    async setBadgeBackgroundColor() {},
  },
  tabs: {
    async query() {
      return openTabs;
    },
    async update(id, props) {
      tabsUpdated.push({ id, ...props });
    },
    async create(props) {
      tabsCreated.push(props);
    },
  },
  permissions: {
    async contains({ origins }) {
      return origins.every((o) => grantedOrigins.has(o));
    },
    onAdded: { addListener: (fn) => permissionListeners.push(fn) },
    onRemoved: { addListener: (fn) => permissionListeners.push(fn) },
  },
};

// ---------------------------------------------------------------- fake service worker push (D44)
const swListeners = {};
const push = { sub: null, subscribed: [], unsubscribed: 0 };
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/this-extension";
globalThis.self = {
  addEventListener: (type, fn) => (swListeners[type] = fn),
  registration: {
    pushManager: {
      async getSubscription() {
        return push.sub;
      },
      async subscribe(opts) {
        push.subscribed.push(opts);
        push.sub = {
          options: { applicationServerKey: opts.applicationServerKey.buffer },
          toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "p".repeat(87), auth: "a".repeat(22) } }),
          async unsubscribe() {
            push.unsubscribed++;
            push.sub = null;
            return true;
          },
        };
        return push.sub;
      },
    },
  },
};
/** Delivers a push event the way Chrome does, and waits for the work it hands to waitUntil. */
async function fire(type) {
  let work;
  swListeners[type]({ waitUntil: (p) => (work = p) });
  await work;
}

// ---------------------------------------------------------------- fake supabase
const VAPID = Buffer.alloc(65, 7).toString("base64url");
const server = {
  password: "correct-horse-1",
  active: true,
  minutes: 10,
  domains: ["youtube.com"],
  offline: false,
  tokenValid: true,
  heartbeats: 0,
  vapid: VAPID,
  pushSaved: [],
  pushRemoved: [],
};
const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

globalThis.fetch = async (url, init = {}) => {
  if (server.offline) throw new TypeError("fetch failed");
  const u = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  if (u.includes("/auth/v1/token?grant_type=password")) {
    if (body.password !== server.password) return json(400, { error_description: "Invalid login credentials" });
    return json(200, { access_token: "tok1", refresh_token: "ref1", expires_in: 3600, user: { id: "u1", email: body.email } });
  }
  if (u.includes("/auth/v1/token?grant_type=refresh_token")) return json(400, { error_description: "Invalid Refresh Token" });
  if (u.endsWith("/functions/v1/notify") && !init.method) return json(200, { publicKey: server.vapid });
  if (u.includes("/rest/v1/rpc/")) {
    if (!server.tokenValid) return json(401, { message: "JWT expired" });
    if (u.endsWith("/get_focus_state")) {
      const now = Date.now();
      return json(200, {
        server_now: new Date(now).toISOString(),
        active: server.active,
        session_id: server.active ? "s1" : null,
        ends_at: new Date(now + server.minutes * 60000).toISOString(),
        domains: server.domains,
      });
    }
    if (u.endsWith("/heartbeat")) {
      server.heartbeats++;
      return json(200, {});
    }
    if (u.endsWith("/save_extension_push")) {
      server.pushSaved.push(body);
      return json(200, null);
    }
    if (u.endsWith("/remove_push_subscription")) {
      server.pushRemoved.push(body.p_endpoint);
      return json(200, null);
    }
  }
  return json(404, { message: "not found" });
};

await import("../background.js");

const send = (msg, sender = { tab: { id: 1 }, url: "http://localhost:3000/extension" }) =>
  new Promise((resolve) => {
    onMessage(msg, sender, resolve);
  });
const connectMsg = (over = {}) => ({
  type: "SPARROW_CONNECT_PASSWORD",
  supabaseUrl: "https://abc.supabase.co",
  anonKey: "pk",
  email: "me@x.com",
  password: server.password,
  ...over,
});

test("starts disconnected", async () => {
  const s = await send({ type: "SPARROW_STATUS" });
  assert.equal(s.connected, false);
  assert.equal(s.focusActive, false);
  assert.equal(rules.length, 0);
});

test("rejects connect requests that don't come from a page, or point at an untrusted server", async () => {
  assert.equal((await send(connectMsg(), {})).ok, false);
  assert.match((await send(connectMsg({ supabaseUrl: "http://evil.example.com" }))).error, /Missing connection details/);
});

test("wrong password is rejected with a readable message and nothing is stored", async () => {
  const r = await send(connectMsg({ password: "nope" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /Invalid login credentials/);
  assert.equal(store.auth, undefined);
});

test("connecting signs in, syncs, blocks the listed sites and sends redirects for open tabs", async () => {
  openTabs = [
    { id: 7, url: "https://www.youtube.com/watch?v=1" },
    { id: 8, url: "https://example.com/" },
  ];
  const r = await send(connectMsg());
  assert.equal(r.ok, true);
  assert.equal(r.connected, true);
  assert.equal(r.email, "me@x.com");
  assert.equal(r.focusActive, true);
  assert.deepEqual(r.domains, ["youtube.com"]);
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0].condition.requestDomains, ["youtube.com"]);
  assert.equal(badge.text, "10");
  assert.deepEqual(
    tabsUpdated.map((t) => t.id),
    [7],
  );
  assert.ok(server.heartbeats >= 1);
  assert.equal(store.password, undefined);
  assert.ok(!JSON.stringify(store).includes(server.password), "password must never be stored");
});

test("connecting also subscribes to silent push, once, and saves the address for this person", async () => {
  assert.equal(push.subscribed.length, 1);
  assert.equal(push.subscribed[0].userVisibleOnly, false, "nothing is ever shown");
  assert.deepEqual([...push.subscribed[0].applicationServerKey], [...Buffer.alloc(65, 7)]);
  assert.deepEqual(server.pushSaved, [{ p_endpoint: ENDPOINT, p_p256dh: "p".repeat(87), p_auth: "a".repeat(22) }]);
  const s = await send({ type: "SPARROW_SYNC_NOW" });
  assert.equal(s.instantStart, true);
  assert.equal(push.subscribed.length, 1);
  assert.equal(server.pushSaved.length, 1, "saved once, not on every sync");
});

test("a push from Sparrow makes the extension check at once", async () => {
  server.minutes = 20;
  await fire("push");
  assert.equal(badge.text, "20");
  server.active = false;
  await fire("push");
  assert.equal(rules.length, 0, "a session ended elsewhere unblocks straight away");
  server.active = true;
  server.minutes = 10;
  await fire("push");
  assert.equal(rules.length, 2);
});

test("goes offline mid-session: keeps enforcing the last known session", async () => {
  server.offline = true;
  const s = await send({ type: "SPARROW_SYNC_NOW" });
  server.offline = false;
  assert.equal(s.focusActive, true);
  assert.equal(rules.length, 2);
  assert.ok(s.lastError);
});

test("session ends on the server: blocking is removed on next sync", async () => {
  server.active = false;
  const s = await send({ type: "SPARROW_SYNC_NOW" });
  assert.equal(s.focusActive, false);
  assert.equal(rules.length, 0);
  assert.equal(badge.text, "");
});

test("new session with more sites: rules grow", async () => {
  server.active = true;
  server.domains = ["youtube.com", "reddit.com"];
  const s = await send({ type: "SPARROW_SYNC_NOW" });
  assert.equal(rules.length, 4);
  // reddit.com was never allowed: blocked by the browser, and the popup offers to allow it.
  const reddit = rules.find((r) => r.condition.requestDomains[0] === "reddit.com" && r.condition.resourceTypes[0] === "main_frame");
  assert.deepEqual(reddit.action, { type: "block" });
  assert.deepEqual(s.needAccess, ["reddit.com"]);
});

test("allowing a site switches it to the calm blocked page straight away", async () => {
  grantedOrigins.add("*://reddit.com/*");
  grantedOrigins.add("*://*.reddit.com/*");
  for (const fn of permissionListeners) fn({ origins: ["*://reddit.com/*"] });
  await new Promise((r) => setTimeout(r, 20));
  const reddit = rules.find((r) => r.condition.requestDomains[0] === "reddit.com" && r.condition.resourceTypes[0] === "main_frame");
  assert.equal(reddit.action.type, "redirect");
  assert.deepEqual((await send({ type: "SPARROW_STATUS" })).needAccess, []);
});

test("opens Sparrow under the base path the site reported when connecting", async () => {
  await send(connectMsg({ site: "https://owner.github.io/Sparrow" }), { tab: { id: 2 }, url: "https://owner.github.io/Sparrow/extension" });
  await send({ type: "OPEN_APP", path: "focus" });
  assert.equal(tabsCreated.at(-1).url, "https://owner.github.io/Sparrow/focus");
  assert.equal((await send({ type: "SPARROW_STATUS" })).appUrl, "https://owner.github.io/Sparrow/");
});

test("signed out elsewhere: extension stops enforcing and asks to reconnect", async () => {
  server.tokenValid = false;
  const s = await send({ type: "SPARROW_SYNC_NOW" });
  server.tokenValid = true;
  assert.equal(s.connected, false);
  assert.equal(s.focusActive, false);
  assert.equal(rules.length, 0);
  assert.match(s.lastError, /Reconnect/);
  assert.equal(push.sub, null, "this browser stops listening; the server forgets the address at the next push");
  assert.equal(s.instantStart, false);
});

test("disconnect clears everything", async () => {
  await send(connectMsg());
  assert.equal(rules.length, 4);
  assert.equal(push.subscribed.length, 2, "reconnecting subscribes again");
  const s = await send({ type: "SPARROW_SIGN_OUT" });
  assert.equal(s.connected, false);
  assert.equal(rules.length, 0);
  assert.deepEqual(server.pushRemoved, [ENDPOINT], "the server forgets this extension");
  assert.equal(push.sub, null);
});

test("a push arriving while disconnecting can't save the address again", async () => {
  await send(connectMsg());
  const saves = server.pushSaved.length;
  const removed = server.pushRemoved.length;
  const out = send({ type: "SPARROW_SIGN_OUT" });
  const woke = fire("push");
  await Promise.all([out, woke]);
  await send({ type: "SPARROW_SYNC_NOW" });
  assert.equal(server.pushSaved.length, saves, "not saved again");
  assert.equal(server.pushRemoved.length, removed + 1);
  assert.equal(store.push, null);
  assert.equal(push.sub, null);
  assert.equal(rules.length, 0);
});

test("when Chrome replaces the push address, the new one is saved", async () => {
  await send(connectMsg());
  const saves = server.pushSaved.length;
  push.sub = null;
  await fire("pushsubscriptionchange");
  assert.equal(server.pushSaved.length, saves + 1);
  assert.equal((await send({ type: "SPARROW_STATUS" })).instantStart, true);
  await send({ type: "SPARROW_SIGN_OUT" });
});

test("the daily check replaces a subscription made with an old server key", async () => {
  await send(connectMsg());
  const unsubscribed = push.unsubscribed;
  const saves = server.pushSaved.length;
  server.vapid = Buffer.alloc(65, 9).toString("base64url");
  await send({ type: "SPARROW_SYNC_NOW" });
  assert.equal(push.unsubscribed, unsubscribed, "not checked again within the day");
  store.push = { ...store.push, savedAt: Date.now() - 25 * 3600_000 };
  await send({ type: "SPARROW_SYNC_NOW" });
  assert.equal(push.unsubscribed, unsubscribed + 1);
  assert.deepEqual([...push.subscribed.at(-1).applicationServerKey], [...Buffer.alloc(65, 9)]);
  assert.equal(server.pushSaved.length, saves + 1);
  await send({ type: "SPARROW_SIGN_OUT" });
  server.vapid = VAPID;
});

test("a server without notifications set up: polling only, and no new try on every sync", async () => {
  server.vapid = null;
  const before = push.subscribed.length;
  const s = await send(connectMsg());
  assert.equal(s.focusActive, true, "blocking works the same");
  assert.equal(s.instantStart, false);
  assert.ok(store.push.triedAt);
  server.vapid = VAPID;
  await send({ type: "SPARROW_SYNC_NOW" });
  assert.equal(push.subscribed.length, before, "waits a while before trying again");
});
