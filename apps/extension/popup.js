import { originPatterns } from "./lib/state.js";

const el = document.getElementById("content");
const send = (type, extra = {}) => chrome.runtime.sendMessage({ type, ...extra });

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Sites on the list where the extension may not show its calm page yet (it blocks them either way). */
function accessNote(s) {
  if (!s.connected || !s.needAccess?.length) return "";
  const n = s.needAccess.length;
  return `
      <p class="note small">${n} site${n === 1 ? "" : "s"} on your list will show the browser's own "blocked" page. Allow Sparrow on ${n === 1 ? "it" : "them"} to see the calm "This can wait" page instead, also in tabs that are already open.</p>
      <div class="row"><button id="access">Allow on ${n === 1 ? "this site" : `these ${n} sites`}</button></div>`;
}

async function allowAccess(s) {
  const origins = s.needAccess.flatMap(originPatterns);
  // Must run straight from the click: Chrome only asks inside a user gesture.
  await chrome.permissions.request({ origins }).catch(() => false);
  render(await send("POPUP_SYNC"));
}

function render(s) {
  if (!s.connected) {
    el.innerHTML = `
      <p>Not connected yet.</p>
      <p class="quiet small">Open Sparrow, go to Settings → Connect the extension.</p>
      ${s.lastError ? `<p class="note small">${esc(s.lastError)}</p>` : ""}
      <button class="primary" id="open">Open Sparrow</button>`;
  } else if (s.focusActive) {
    el.innerHTML = `
      <p class="quiet" style="margin:0">Focus session running</p>
      <div class="timer">${s.minutesLeft} min left</div>
      <p class="small quiet">Blocking ${s.domains.length} site${s.domains.length === 1 ? "" : "s"}. To end early, use the Sparrow website.</p>
      <div class="row"><button id="open">Open Sparrow</button></div>${accessNote(s)}`;
  } else {
    el.innerHTML = `
      <p>No focus session right now.</p>
      <p class="small quiet">${s.domains.length} site${s.domains.length === 1 ? "" : "s"} on your list. Signed in as ${esc(s.email ?? "")}.</p>
      ${s.lastError ? `<p class="note small">Last sync problem: ${esc(s.lastError)}</p>` : ""}
      <div class="row"><button class="primary" id="open">Start one in Sparrow</button><button id="sync">Sync now</button></div>${accessNote(s)}`;
  }
  document.getElementById("access")?.addEventListener("click", () => allowAccess(s));
  document.getElementById("open")?.addEventListener("click", () => send("OPEN_APP", { path: s.connected ? "focus" : "extension" }));
  document.getElementById("sync")?.addEventListener("click", async () => render(await send("POPUP_SYNC")));
}

send("POPUP_STATE").then(render);
