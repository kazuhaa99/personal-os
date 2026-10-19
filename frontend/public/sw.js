// Personal OS service worker.
// Caches only the static app (hashed bundles, icons, wallpapers). Anything under /api —
// finances, tasks, auth — is never intercepted, so it always comes from the network and
// never lands in a cache. Pages are network-first; with no network the offline page shows.

const VERSION = "v1";
const STATIC = `pos-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

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

async function networkFirstPage(req) {
  try {
    return await fetch(req);
  } catch {
    return (await caches.match(OFFLINE_URL)) ?? new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Private data: straight to the network, no caching, no offline fallback.
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
  } else if (url.pathname.startsWith("/assets/")) {
    // Vite bundles are content-hashed, so a cached copy is never stale.
    event.respondWith(cacheFirst(req));
  } else if (/^\/(icons|media)\//.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(event));
  }
});
