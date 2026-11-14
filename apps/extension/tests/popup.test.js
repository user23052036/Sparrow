// Runs the real popup.js against a tiny fake page and a fake `chrome`, to check the site-access request.
import { test } from "node:test";
import assert from "node:assert/strict";

const elements = {};
function element(id) {
  return (elements[id] ??= {
    id,
    innerHTML: "",
    listeners: {},
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
  });
}
// popup.js renders into #content with innerHTML; buttons are looked up by id after each render.
globalThis.document = {
  getElementById(id) {
    if (id === "content") return element(id);
    return elements.content.innerHTML.includes(`id="${id}"`) ? element(id) : null;
  },
};

const requested = [];
let state = { connected: true, focusActive: true, minutesLeft: 20, domains: ["youtube.com", "reddit.com"], needAccess: ["reddit.com"], email: "me@x.com" };
globalThis.chrome = {
  runtime: {
    async sendMessage(msg) {
      if (msg.type === "POPUP_SYNC") state = { ...state, needAccess: [] };
      return state;
    },
  },
  permissions: {
    async request({ origins }) {
      requested.push(origins);
      return true;
    },
  },
};

await import("../popup.js");
await new Promise((r) => setTimeout(r, 10));

test("the popup offers to allow the calm page on sites that still need it", () => {
  assert.match(elements.content.innerHTML, /1 site on your list/);
  assert.match(elements.content.innerHTML, /id="access"/);
});

test("allowing asks Chrome for exactly those sites and their subdomains, then re-syncs", async () => {
  elements.access.listeners.click();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(requested, [["*://reddit.com/*", "*://*.reddit.com/*"]]);
  assert.doesNotMatch(elements.content.innerHTML, /id="access"/);
});
