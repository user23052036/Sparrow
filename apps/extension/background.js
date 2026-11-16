import { normalizeDomainList, hostMatches } from "./lib/domains.js";
import { appUrlFrom, buildRules, endsAtLocal, isActive, minutesLeft, isAllowedSupabaseUrl, originPatterns } from "./lib/state.js";
import { DEFAULT_SITE } from "./lib/site.js";
import { base64UrlToBytes, pushNeedsSaving, pushOwner, sameKey } from "./lib/push.js";
import * as api from "./lib/api.js";

const TICK = "sparrow-tick";
const END = "sparrow-end";
const BLOCKED_PAGE = "/blocked.html";

// ---------------------------------------------------------------- storage
const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);
const getAuth = async () => (await get("auth")).auth;
const saveAuth = (a) => set({ auth: a });

async function deviceId() {
  const { deviceId } = await get("deviceId");
  if (deviceId) return deviceId;
  const id = crypto.randomUUID();
  await set({ deviceId: id });
  return id;
}

async function deviceLabel() {
  const ua = navigator.userAgent;
  const browser = navigator.brave ? "Brave" : ua.includes("Edg/") ? "Edge" : "Chrome";
  const { os } = await chrome.runtime.getPlatformInfo();
  const osName = { mac: "Mac", win: "Windows", linux: "Linux", cros: "ChromeOS" }[os] ?? os;
  return `${browser} on ${osName}`;
}

// ------------------------------------------------------------- lifecycle
async function ensureAlarm() {
  if (!(await chrome.alarms.get(TICK))) chrome.alarms.create(TICK, { periodInMinutes: 0.5 });
}
chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarm();
  void deviceId();
  void sync();
});
chrome.runtime.onStartup.addListener(() => {
  void ensureAlarm();
  void sync();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === TICK || a.name === END) void sync();
});
// A session started or ended on another device (D44): Sparrow sends an empty, silent push and the extension
// checks at once. The 30-second alarm stays as the fallback (D10).
self.addEventListener("push", (e) => e.waitUntil(sync()));
self.addEventListener("pushsubscriptionchange", (e) => e.waitUntil(set({ push: null }).then(sync)));
// The person allowed (or took back) the calm blocked page on some sites: rebuild the rules.
chrome.permissions?.onAdded?.addListener(() => void queue(reapply));
chrome.permissions?.onRemoved?.addListener(() => void queue(reapply));
void ensureAlarm();

// ------------------------------------------------------------------ sync
// Serialised so two overlapping syncs never refresh the same token twice.
// Rule rebuilds go through the same queue, so two updateDynamicRules calls never overlap.
let running = Promise.resolve();
function queue(fn) {
  running = running.then(fn, fn);
  return running;
}
function sync() {
  return queue(doSync);
}

async function doSync() {
  const { config, auth, focus: stored } = await get(["config", "auth", "focus"]);
  let focus = stored ?? { active: false };
  if (!config || !auth) {
    await applyBlocking({ active: false });
    return;
  }
  let synced = false;
  try {
    const fs = await api.rpc(config, getAuth, saveAuth, "get_focus_state");
    const now = Date.now();
    focus = fs.active
      ? { active: true, sessionId: fs.session_id, endsAtLocal: endsAtLocal(fs.ends_at, fs.server_now, now), domains: normalizeDomainList(fs.domains) }
      : { active: false, domains: normalizeDomainList(fs.domains) };
    await set({ focus, lastSyncAt: now, lastError: null });
    await api.rpc(config, getAuth, saveAuth, "heartbeat", {
      p_device_id: await deviceId(),
      p_platform: "extension",
      p_label: await deviceLabel(),
      p_protection: true,
    });
    synced = true;
  } catch (e) {
    if (e instanceof api.AuthError) {
      // Session is gone (signed out elsewhere or expired). Stop enforcing a
      // session we can no longer confirm, and ask the user to reconnect.
      await set({ auth: null, focus: { active: false }, lastError: "Signed out. Reconnect from the Sparrow website." });
      focus = { active: false };
      await dropPush(null, null);
    } else {
      // Offline or server error: keep enforcing the last known session until it ends.
      await set({ lastError: String(e.message || e) });
    }
  }
  await applyBlocking(focus);
  if (synced) await ensurePush(config);
}

// ------------------------------------------------------------------ push
/** Subscribes this extension to silent Web Push and saves the address for the signed-in person (D44); checked again daily. */
async function ensurePush(config) {
  const pm = self.registration?.pushManager;
  const { auth, push } = await get(["auth", "push"]);
  const owner = pushOwner(auth);
  if (!pm || !pushNeedsSaving(push, owner, Date.now())) return;
  try {
    const { publicKey } = (await api.invoke(config, getAuth, saveAuth, "notify")) ?? {};
    if (!publicKey) throw new Error("notifications aren't set up on this server yet");
    const key = base64UrlToBytes(publicKey);
    let sub = await pm.getSubscription();
    if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await pm.subscribe({ userVisibleOnly: false, applicationServerKey: key });
    const { endpoint, keys } = sub.toJSON();
    await api.rpc(config, getAuth, saveAuth, "save_extension_push", { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth });
    await set({ push: { owner, endpoint, savedAt: Date.now() } });
  } catch {
    // Polling still works; try again later.
    await set({ push: { owner, triedAt: Date.now() } });
  }
}

/** Forgets this extension's push address: on the server with the sign-in being ended (if any), and in the browser. */
async function dropPush(config, auth) {
  const { push } = await get("push");
  await set({ push: null });
  if (config && auth && push?.endpoint) {
    await api
      .rpc(
        config,
        async () => auth,
        async () => {},
        "remove_push_subscription",
        { p_endpoint: push.endpoint },
      )
      .catch(() => {});
  }
  const sub = await self.registration?.pushManager?.getSubscription().catch(() => null);
  await sub?.unsubscribe().catch(() => false);
}

// -------------------------------------------------------------- blocking
async function reapply() {
  const { focus } = await get("focus");
  await applyBlocking(focus ?? { active: false });
}

/** Listed sites the person has let the extension show its blocked page on. */
async function grantedDomains(domains) {
  const out = [];
  for (const d of domains) {
    try {
      if (await chrome.permissions.contains({ origins: originPatterns(d) })) out.push(d);
    } catch {
      /* not a pattern Chrome accepts: treat as not allowed */
    }
  }
  return out;
}

async function applyBlocking(focus) {
  const now = Date.now();
  const active = isActive(focus, now);
  const domains = active ? focus.domains : [];
  const granted = await grantedDomains(domains);
  const signature = JSON.stringify([domains, granted]);
  const { ruleSignature } = await get("ruleSignature");

  if (signature !== ruleSignature) {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: buildRules(domains, BLOCKED_PAGE, granted),
    });
    await set({ ruleSignature: signature });
    // Tab addresses are only visible on sites the extension has access to.
    if (active) await closeOutOpenTabs(granted);
  }

  if (active) {
    chrome.alarms.create(END, { when: focus.endsAtLocal + 1000 });
    await chrome.action.setBadgeBackgroundColor({ color: "#3d6a86" });
    await chrome.action.setBadgeText({ text: String(minutesLeft(focus, now)) });
  } else {
    await chrome.alarms.clear(END);
    await chrome.action.setBadgeText({ text: "" });
  }
}

/** Tabs already open on a blocked site are sent to the blocked page too. */
async function closeOutOpenTabs(domains) {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (!t.url || !/^https?:/.test(t.url)) continue;
    try {
      if (hostMatches(new URL(t.url).hostname, domains)) {
        await chrome.tabs.update(t.id, { url: chrome.runtime.getURL(BLOCKED_PAGE) });
      }
    } catch {
      /* tab closed or not accessible */
    }
  }
}

// -------------------------------------------------------------- messages
/** Where Sparrow lives: the site the person connected from, else the one this copy was built for. */
async function appUrl() {
  const { appUrl: saved, appOrigin } = await get(["appUrl", "appOrigin"]);
  return saved ?? (appOrigin ? `${appOrigin}/` : DEFAULT_SITE); // appOrigin: saved by versions before 0.2.0
}

async function status() {
  const { config, auth, focus, lastSyncAt, lastError, push } = await get(["config", "auth", "focus", "lastSyncAt", "lastError", "push"]);
  const now = Date.now();
  const domains = focus?.domains ?? [];
  const granted = await grantedDomains(domains);
  return {
    ok: true,
    version: chrome.runtime.getManifest().version,
    configured: Boolean(config),
    connected: Boolean(auth),
    email: auth?.email ?? null,
    deviceId: await deviceId(),
    focusActive: isActive(focus, now),
    minutesLeft: minutesLeft(focus, now),
    domains,
    needAccess: domains.filter((d) => !granted.includes(d)),
    lastSyncAt: lastSyncAt ?? null,
    lastError: lastError ?? null,
    instantStart: Boolean(auth && push?.endpoint && push.owner === pushOwner(auth)),
    appUrl: await appUrl(),
  };
}

async function handle(msg, sender) {
  switch (msg?.type) {
    case "SPARROW_STATUS":
    case "POPUP_STATE":
      return status();

    case "SPARROW_SYNC_NOW":
    case "POPUP_SYNC":
      await sync();
      return status();

    case "SPARROW_CONNECT_START": {
      if (!sender.tab) return { ok: false, error: "Connect from the Sparrow website." };
      const { supabaseUrl, anonKey, email } = msg;
      if (!isAllowedSupabaseUrl(supabaseUrl) || !anonKey || !email) return { ok: false, error: "Missing connection details." };
      const config = { url: supabaseUrl.replace(/\/$/, ""), anonKey };
      try {
        await api.requestOtp(config, email);
      } catch (e) {
        return { ok: false, error: `Couldn't send the code: ${e.message}` };
      }
      await set({ pending: { config, email }, appUrl: appUrlFrom(sender.url, msg.site) });
      return { ok: true };
    }

    case "SPARROW_CONNECT_PASSWORD": {
      if (!sender.tab) return { ok: false, error: "Connect from the Sparrow website." };
      const { supabaseUrl, anonKey, email, password } = msg;
      if (!isAllowedSupabaseUrl(supabaseUrl) || !anonKey || !email || !password) return { ok: false, error: "Missing connection details." };
      const config = { url: supabaseUrl.replace(/\/$/, ""), anonKey };
      try {
        const auth = await api.signInWithPassword(config, email, password);
        await set({ config, auth, pending: null, lastError: null, appUrl: appUrlFrom(sender.url, msg.site) });
      } catch (e) {
        return { ok: false, error: `Couldn't connect: ${e.message}` };
      }
      await sync();
      return status();
    }

    case "SPARROW_CONNECT_VERIFY": {
      const { pending } = await get("pending");
      if (!pending) return { ok: false, error: "Start again: ask for a new code." };
      try {
        const auth = await api.verifyOtp(pending.config, pending.email, String(msg.code ?? "").trim());
        await set({ config: pending.config, auth, pending: null, lastError: null });
      } catch (e) {
        return { ok: false, error: `That code didn't work: ${e.message}` };
      }
      await sync();
      return status();
    }

    case "SPARROW_SIGN_OUT": {
      // One step in the queue, signed-out state first: a sync or push arriving meanwhile can't save the address again.
      await queue(async () => {
        const { config, auth } = await get(["config", "auth"]);
        await set({ auth: null, focus: { active: false } });
        await dropPush(config, auth);
        if (config && auth) await api.signOut(config, auth);
        await applyBlocking({ active: false });
      });
      return status();
    }

    case "OPEN_APP": {
      await chrome.tabs.create({ url: new URL(msg.path ?? "today", await appUrl()).href });
      return { ok: true };
    }

    default:
      return { ok: false, error: "Unknown request" };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
  return true; // async response
});
