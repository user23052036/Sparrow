// Bridge between the Sparrow website and the extension. Runs only on the
// origins listed in manifest.json "content_scripts.matches".
window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const d = event.data;
  if (!d || d.source !== "sparrow-web" || typeof d.type !== "string" || !d.type.startsWith("SPARROW_")) return;
  const reply = (body) => window.postMessage({ source: "sparrow-ext", replyTo: d.id, ...body }, window.location.origin);
  try {
    chrome.runtime.sendMessage(d, (resp) => {
      if (chrome.runtime.lastError) reply({ ok: false, error: "The extension isn't responding. Try reloading this page." });
      else reply(resp ?? { ok: false, error: "No response" });
    });
  } catch {
    reply({ ok: false, error: "The extension was updated. Reload this page." });
  }
});
