// Service worker: keeps the app itself on the phone so it opens with no
// connection, or while the free server is still waking up.
// Generated at build time from web/sw-template.js; the build id and file list are
// filled in by vite.config.ts. Data (/api) is never cached here — the app
// keeps its own saved copy of that (see web/src/lib/offline.ts).

const CACHE = "ambassadors-muvamjwu";
const FILES = ["index.html","assets/index-PFWxCwCx.js","assets/index-BYa6rGNA.css","logo.jpg","hero.jpg","manifest.webmanifest","logos/rafiki.png","logos/daniels.png","logos/icc-imara.png","logos/rosslyn.png","backgrounds/cover.jpg","backgrounds/rafiki.jpg","backgrounds/daniels.jpg","backgrounds/icc-imara.jpg","backgrounds/rosslyn.jpg"];
const SHELL = "index.html";
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ambassadors-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // fonts etc. go to the network
  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  // Live data and the version check always go to the server.
  if (path.startsWith("api/") || path === "version.json" || path.startsWith("sw.js")) return;

  if (request.mode === "navigate") {
    // Pages: the newest from the server if it answers quickly, otherwise the
    // saved copy — so a sleeping server or no signal still opens the app.
    event.respondWith(
      Promise.race([fetch(request), timeout(NAVIGATION_TIMEOUT_MS)])
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((c) => c.put(SHELL, response.clone()));
          return response;
        })
        .catch(() => caches.match(SHELL).then((cached) => cached || fetch(request))),
    );
    return;
  }

  // Files (scripts, styles, logos, photos): saved copy first, then network.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
