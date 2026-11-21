// Service worker for Ambassadors Football.
// 1. Keeps the app shell on the phone so it opens on the pitch with no signal.
// 2. Background Sync: when the connection returns (even if the app is closed),
//    sends the offline queue (IndexedDB "ambassadors" → "outbox") to /api/sync.
// Generated at build time from web/sw-template.js (build id and file list filled in).

const CACHE = "ambassadors-mwqbtaah";
const FILES = ["index.html","assets/index-COjdKe3p.js","assets/archivo-latin-ext-wdth-normal-7khWdh9v.woff2","assets/archivo-latin-wdth-normal-DY7AcnAa.woff2","assets/archivo-vietnamese-wdth-normal-rJmnGBSt.woff2","assets/index-BkXnnHmL.css","logo.jpg","hero.jpg","icon-192.png","icon-512.png","manifest.webmanifest","logos/daniels.png","logos/icc-imara.png","logos/rafiki.png","logos/rosslyn.png"];
const SHELL = "index.html";
// "/" on its own, "/ambassadors/" inside the Rafiki server.
const SCOPE_PATH = new URL(self.registration.scope).pathname;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
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
  if (url.origin !== self.location.origin) {
    // Fonts: keep a copy once seen.
    if (url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("googleapis.com")) {
      event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })));
    }
    return;
  }
  if (url.pathname.startsWith(`${SCOPE_PATH}api/`) || url.pathname === `${SCOPE_PATH}sw.js`) return; // data is cached by the app in IndexedDB

  if (request.mode === "navigate") {
    event.respondWith(
      Promise.race([fetch(request), timeout(3500)])
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(SHELL, res.clone()));
          return res;
        })
        .catch(() => caches.match(SHELL).then((hit) => hit || fetch(request))),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    })),
  );
});

// ---- Background Sync ------------------------------------------------------------

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ambassadors-football", 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // The app creates the stores; if they do not exist yet there is nothing to send.
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("failed")) db.createObjectStore("failed", { keyPath: "id" });
    };
  });
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

async function flushFromWorker() {
  const db = await idb();
  const token = await tx(db, "meta", "readonly", (s) => s.get("token"));
  const ops = await tx(db, "outbox", "readonly", (s) => s.getAll());
  if (!token || !ops || ops.length === 0) return;
  ops.sort((a, b) => a.createdAt - b.createdAt);
  const res = await fetch(`${SCOPE_PATH}api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ops: ops.slice(0, 100).map((o) => ({ id: o.id, type: o.type, payload: o.payload })) }),
  });
  if (!res.ok) throw new Error(`sync ${res.status}`); // the browser retries the sync later
  const { results } = await res.json();
  const byId = new Map(ops.map((o) => [o.id, o]));
  await tx(db, "outbox", "readwrite", (s) => {
    for (const r of results) if (r.ok || (r.status >= 400 && r.status < 500)) s.delete(r.id);
  });
  await tx(db, "failed", "readwrite", (s) => {
    for (const r of results) if (!r.ok && r.status >= 400 && r.status < 500) s.put({ ...byId.get(r.id), error: r.error });
  });
  const clients = await self.clients.matchAll();
  clients.forEach((c) => c.postMessage({ type: "synced" }));
}

self.addEventListener("sync", (event) => {
  if (event.tag === "ambassadors-sync") event.waitUntil(flushFromWorker());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "skip-waiting") self.skipWaiting();
});
