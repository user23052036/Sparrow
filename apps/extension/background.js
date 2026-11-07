import { normalizeDomainList, hostMatches } from "./lib/domains.js";
import { buildRules, endsAtLocal, isActive, minutesLeft, isAllowedSupabaseUrl } from "./lib/state.js";
import * as api from "./lib/api.js";

const TICK = "sparrow-tick";
const END = "sparrow-end";
const BLOCKED_PAGE = "/blocked.html";

// ---------------------------------------------------------------- storage
const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);

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
chrome.runtime.onInstalled.addListener(() => { void ensureAlarm(); void deviceId(); void sync(); });
chrome.runtime.onStartup.addListener(() => { void ensureAlarm(); void sync(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === TICK || a.name === END) void sync(); });
void ensureAlarm();

// ------------------------------------------------------------------ sync
// Serialised so two overlapping syncs never refresh the same token twice.
let running = Promise.resolve();
function sync() {
  running = running.then(doSync, doSync);
  return running;
}

async function doSync() {
  const { config, auth, focus: stored } = await get(["config", "auth", "focus"]);
  let focus = stored ?? { active: false };
  if (!config || !auth) {
    await applyBlocking({ active: false });
    return;
  }
  const getAuth = async () => (await get("auth")).auth;
  const saveAuth = (a) => set({ auth: a });
  try {
    const fs = await api.rpc(config, getAuth, saveAuth, "get_focus_state");
    const now = Date.now();
    focus = fs.active
      ? { active: true, sessionId: fs.session_id, endsAtLocal: endsAtLocal(fs.ends_at, fs.server_now, now), domains: normalizeDomainList(fs.domains) }
      : { active: false, domains: normalizeDomainList(fs.domains) };
    await set({ focus, lastSyncAt: now, lastError: null });
    await api.rpc(config, getAuth, saveAuth, "heartbeat", {
      p_device_id: await deviceId(), p_platform: "extension", p_label: await deviceLabel(), p_protection: true,
    });
  } catch (e) {
    if (e instanceof api.AuthError) {
      // Session is gone (signed out elsewhere or expired). Stop enforcing a
      // session we can no longer confirm, and ask the user to reconnect.
      await set({ auth: null, focus: { active: false }, lastError: "Signed out. Reconnect from the Sparrow website." });
      focus = { active: false };
    } else {
      // Offline or server error: keep enforcing the last known session until it ends.
      await set({ lastError: String(e.message || e) });
    }
  }
  await applyBlocking(focus);
}

// -------------------------------------------------------------- blocking
async function applyBlocking(focus) {
  const now = Date.now();
  const active = isActive(focus, now);
  const domains = active ? focus.domains : [];
  const signature = JSON.stringify(domains);
  const { ruleSignature } = await get("ruleSignature");

  if (signature !== ruleSignature) {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: buildRules(domains, BLOCKED_PAGE),
    });
    await set({ ruleSignature: signature });
    if (active) await closeOutOpenTabs(domains);
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
    } catch { /* tab closed or not accessible */ }
  }
}

// -------------------------------------------------------------- messages
async function status() {
  const { config, auth, focus, lastSyncAt, lastError, appOrigin } = await get(["config", "auth", "focus", "lastSyncAt", "lastError", "appOrigin"]);
  const now = Date.now();
  return {
    ok: true,
    version: chrome.runtime.getManifest().version,
    configured: Boolean(config),
    connected: Boolean(auth),
    email: auth?.email ?? null,
    deviceId: await deviceId(),
    focusActive: isActive(focus, now),
    minutesLeft: minutesLeft(focus, now),
    domains: focus?.domains ?? [],
    lastSyncAt: lastSyncAt ?? null,
    lastError: lastError ?? null,
    appOrigin: appOrigin ?? null,
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
      await set({ pending: { config, email }, appOrigin: new URL(sender.url).origin });
      return { ok: true };
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
      const { config, auth } = await get(["config", "auth"]);
      if (config && auth) await api.signOut(config, auth);
      await set({ auth: null, focus: { active: false } });
      await applyBlocking({ active: false });
      return status();
    }

    case "OPEN_APP": {
      const { appOrigin } = await get("appOrigin");
      await chrome.tabs.create({ url: `${appOrigin ?? "http://localhost:3000"}/${msg.path ?? "today"}` });
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
