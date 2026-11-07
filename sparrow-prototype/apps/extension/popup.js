const el = document.getElementById("content");
const send = (type, extra = {}) => chrome.runtime.sendMessage({ type, ...extra });

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

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
      <div class="row"><button id="open">Open Sparrow</button></div>`;
  } else {
    el.innerHTML = `
      <p>No focus session right now.</p>
      <p class="small quiet">${s.domains.length} site${s.domains.length === 1 ? "" : "s"} on your list. Signed in as ${esc(s.email ?? "")}.</p>
      ${s.lastError ? `<p class="note small">Last sync problem: ${esc(s.lastError)}</p>` : ""}
      <div class="row"><button class="primary" id="open">Start one in Sparrow</button><button id="sync">Sync now</button></div>`;
  }
  document.getElementById("open")?.addEventListener("click", () => send("OPEN_APP", { path: s.connected ? "focus" : "extension" }));
  document.getElementById("sync")?.addEventListener("click", async () => render(await send("POPUP_SYNC")));
}

send("POPUP_STATE").then(render);
