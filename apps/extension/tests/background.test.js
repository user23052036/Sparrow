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

globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys ?? {});
        return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
      },
      async set(obj) { Object.assign(store, obj); },
    },
  },
  alarms: { async get() { return null; }, create() {}, async clear() {}, onAlarm: { addListener() {} } },
  runtime: {
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    onMessage: { addListener(fn) { onMessage = fn; } },
    getManifest: () => ({ version: "0.1.0" }),
    getPlatformInfo: async () => ({ os: "mac" }),
    getURL: (p) => `chrome-extension://abc${p}`,
  },
  declarativeNetRequest: {
    async getDynamicRules() { return rules; },
    async updateDynamicRules({ removeRuleIds = [], addRules = [] }) {
      rules = rules.filter((r) => !removeRuleIds.includes(r.id)).concat(addRules);
    },
  },
  action: { async setBadgeText({ text }) { badge.text = text; }, async setBadgeBackgroundColor() {} },
  tabs: {
    async query() { return openTabs; },
    async update(id, props) { tabsUpdated.push({ id, ...props }); },
    async create() {},
  },
};

// ---------------------------------------------------------------- fake supabase
const server = { password: "correct-horse-1", active: true, minutes: 10, domains: ["youtube.com"], offline: false, tokenValid: true, heartbeats: 0 };
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
  if (u.includes("/rest/v1/rpc/")) {
    if (!server.tokenValid) return json(401, { message: "JWT expired" });
    if (u.endsWith("/get_focus_state")) {
      const now = Date.now();
      return json(200, {
        server_now: new Date(now).toISOString(), active: server.active, session_id: server.active ? "s1" : null,
        ends_at: new Date(now + server.minutes * 60000).toISOString(), domains: server.domains,
      });
    }
    if (u.endsWith("/heartbeat")) { server.heartbeats++; return json(200, {}); }
  }
  return json(404, { message: "not found" });
};

await import("../background.js");

const send = (msg, sender = { tab: { id: 1 }, url: "http://localhost:3000/extension" }) =>
  new Promise((resolve) => { onMessage(msg, sender, resolve); });
const connectMsg = (over = {}) => ({
  type: "SPARROW_CONNECT_PASSWORD", supabaseUrl: "https://abc.supabase.co", anonKey: "pk", email: "me@x.com", password: server.password, ...over,
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
  openTabs = [{ id: 7, url: "https://www.youtube.com/watch?v=1" }, { id: 8, url: "https://example.com/" }];
  const r = await send(connectMsg());
  assert.equal(r.ok, true);
  assert.equal(r.connected, true);
  assert.equal(r.email, "me@x.com");
  assert.equal(r.focusActive, true);
  assert.deepEqual(r.domains, ["youtube.com"]);
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0].condition.requestDomains, ["youtube.com"]);
  assert.equal(badge.text, "10");
  assert.deepEqual(tabsUpdated.map((t) => t.id), [7]);
  assert.ok(server.heartbeats >= 1);
  assert.equal(store.password, undefined);
  assert.ok(!JSON.stringify(store).includes(server.password), "password must never be stored");
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
  await send({ type: "SPARROW_SYNC_NOW" });
  assert.equal(rules.length, 4);
});

test("signed out elsewhere: extension stops enforcing and asks to reconnect", async () => {
  server.tokenValid = false;
  const s = await send({ type: "SPARROW_SYNC_NOW" });
  server.tokenValid = true;
  assert.equal(s.connected, false);
  assert.equal(s.focusActive, false);
  assert.equal(rules.length, 0);
  assert.match(s.lastError, /Reconnect/);
});

test("disconnect clears everything", async () => {
  await send(connectMsg());
  assert.equal(rules.length, 4);
  const s = await send({ type: "SPARROW_SIGN_OUT" });
  assert.equal(s.connected, false);
  assert.equal(rules.length, 0);
});
