/* Sparrow service worker: installability and a calm offline page.
 * It never caches pages or data (everything private stays out of the cache) and never touches
 * requests to other origins such as Supabase. Only static assets and the offline page are kept. */
const VERSION = "sparrow-v2";
// The folder this worker is served from: "/" locally, "/Sparrow/" on GitHub Pages (D41).
const BASE = new URL("./", self.location).pathname;
const SHELL = ["offline.html", "icon.svg", "icon-192.png", "manifest.webmanifest"].map((p) => BASE + p);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Only Sparrow's own old caches: on GitHub Pages the origin is shared with the owner's other sites.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sparrow-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Built, fingerprinted assets never change: serve from cache once seen.
  if (url.pathname.startsWith(BASE + "_next/static/")) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Pages: always the network. If it is down, show the offline page.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(BASE + "offline.html")));
  }
});

// Web Push (D38). The server sends only fixed words and a path inside the app (supabase/functions/notify);
// nothing a person wrote ever reaches a lock screen.
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    /* not JSON: show the plain fallback */
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "Sparrow", {
      body: d.body || "",
      tag: d.tag,
      icon: BASE + "icon-192.png",
      badge: BASE + "icon-192.png",
      data: { url: d.url || "today" },
      actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : [],
    }),
  );
});

// Opens (or focuses) Sparrow at the notification's page. A button press adds ?answer=… so the page can
// point at that choice; it still asks for one tap, so a link alone can never answer for someone.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "today";
  const target = new URL(path, self.location.origin + BASE);
  if (target.origin !== self.location.origin) return;
  if (event.action) target.searchParams.set("answer", event.action);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin + BASE) && "navigate" in c) return c.focus().then(() => c.navigate(target.href));
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
