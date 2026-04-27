/* Basic runtime-caching service worker for a Vite SPA.
   - Cache-first for same-origin static assets
   - Network-first for navigations (with cached fallback)
*/

const CACHE_NAME = "dmaestro-pwa-v2";
const CORE_ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/pwa-192.png", "/pwa-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      self.clients.claim();
    })()
  );
});

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put("/index.html", res.clone());
          return res;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(request)) || (await cache.match("/index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // Assets (JS/CSS/images): cache-first + background refresh
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        event.waitUntil(
          fetch(request)
            .then((res) => {
              if (res && res.ok) cache.put(request, res.clone());
            })
            .catch(() => undefined)
        );
        return cached;
      }

      const res = await fetch(request);
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })()
  );
});

