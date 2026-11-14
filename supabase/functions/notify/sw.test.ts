// The other half of a notification: what apps/web/public/sw.js does with the payload this function sends.
// Runs the real service worker file in a sandbox with a stand-in `self`.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { buildPayload } from "./logic.ts";

const SW = readFileSync(fileURLToPath(new URL("../../../apps/web/public/sw.js", import.meta.url)), "utf8");
const REF = "11111111-1111-4111-8111-111111111111";

function worker(origin = "https://owner.github.io", path = "/Sparrow/sw.js") {
  const listeners: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  let windows: { url: string; focus: () => Promise<void>; navigate: (u: string) => Promise<void> }[] = [];
  const self = {
    location: new URL(origin + path),
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }) },
    clients: {
      matchAll: async () => windows,
      openWindow: async (u: string) => void opened.push(u),
      claim: async () => {},
    },
    skipWaiting() {},
  };
  runInNewContext(SW, { self, URL, caches: {}, fetch: () => Promise.reject(new Error("offline")) });
  const run = async (type: string, event: Record<string, unknown>) => {
    let wait: Promise<unknown> = Promise.resolve();
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
  };
  const setWindows = (urls: string[]) => (windows = urls.map((url) => ({ url, focus: async () => {}, navigate: async (u: string) => void navigated.push(u) })));
  return { run, shown, opened, navigated, setWindows };
}

describe("service worker notifications", () => {
  it("shows exactly the words and buttons the server sent", async () => {
    const w = worker();
    const payload = buildPayload("key_request", REF);
    await w.run("push", { data: { json: () => payload } });
    assert.equal(w.shown.length, 1);
    assert.equal(w.shown[0].title, payload.title);
    assert.equal(w.shown[0].options.body, payload.body);
    assert.deepEqual(w.shown[0].options.actions, payload.actions);
    assert.equal(w.shown[0].options.icon, "/Sparrow/icon-192.png");
  });

  it("a push it can't read still shows a plain Sparrow notification", async () => {
    const w = worker();
    await w.run("push", { data: { json: () => JSON.parse("not json") } });
    assert.equal(w.shown[0].title, "Sparrow");
  });

  it("a button opens the request under the app's own path, with the chosen answer", async () => {
    const w = worker();
    const close = () => {};
    await w.run("notificationclick", { action: "let-out", notification: { close, data: { url: buildPayload("key_request", REF).url } } });
    assert.deepEqual(w.opened, [`https://owner.github.io/Sparrow/partner?request=${REF}&answer=let-out`]);
  });

  it("a tap on the notification reuses an open Sparrow window", async () => {
    const w = worker();
    w.setWindows(["https://owner.github.io/Other/", "https://owner.github.io/Sparrow/today"]);
    await w.run("notificationclick", { action: "", notification: { close() {}, data: { url: "focus" } } });
    assert.deepEqual(w.navigated, ["https://owner.github.io/Sparrow/focus"]);
    assert.deepEqual(w.opened, []);
  });

  it("never opens another site, whatever the payload says", async () => {
    const w = worker();
    await w.run("notificationclick", { action: "", notification: { close() {}, data: { url: "https://evil.example.com/" } } });
    assert.deepEqual(w.opened, []);
  });
});
