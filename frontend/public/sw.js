// Personal OS service worker.
// Caches only the static app (hashed bundles, icons, wallpapers). Anything under <base>api/ —
// finances, tasks, auth — is never intercepted, so it always comes from the network and
// never lands in a cache. Pages are network-first; with no network the offline page shows.
// The app may live under a path prefix (VITE_BASE); everything is resolved against the
// registration scope, and requests outside it are left alone (the host site may share our origin).

const VERSION = "v2";
const STATIC = `pos-static-${VERSION}`;
const BASE = new URL(self.registration.scope).pathname; // "/" or "/prefix/"
const at = (p) => BASE + p;
const OFFLINE_URL = at("offline.html");
const PRECACHE = [OFFLINE_URL, at("manifest.webmanifest"), at("icons/icon-192.png"), at("icons/icon-512.png"), at("icons/apple-touch-icon.png")];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pos-") && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (res) => res && res.ok && res.type === "basic";

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) (await caches.open(STATIC)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(event) {
  const req = event.request;
  const hit = await caches.match(req);
  const update = fetch(req).then(async (res) => {
    if (cacheable(res)) (await caches.open(STATIC)).put(req, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(update.catch(() => undefined));
    return hit;
  }
  return update;
}

async function offlinePage() {
  const cached = await caches.match(OFFLINE_URL);
  if (!cached) return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  // The page may be shown at any depth of the app, so its own links are written as %BASE%.
  const html = (await cached.text()).replaceAll("%BASE%", BASE);
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function networkFirstPage(req) {
  try {
    return await fetch(req);
  } catch {
    return offlinePage();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const path = url.pathname.slice(BASE.length); // relative to the app root
  // Private data: straight to the network, no caching, no offline fallback.
  if (path.startsWith("api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
  } else if (path.startsWith("assets/")) {
    // Vite bundles are content-hashed, so a cached copy is never stale.
    event.respondWith(cacheFirst(req));
  } else if (/^(icons|media)\//.test(path) || path === "manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(event));
  }
});
