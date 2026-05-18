// Tanmatra service worker — v1
// Strategy:
//   - Static assets (JS/CSS/fonts/images): cache-first, 30-day TTL
//   - Navigation (HTML): network-first with offline fallback
//   - API calls (/api/*): network-only (never cache — data must be fresh)

const CACHE_NAME = "tanmatra-v1";

const PRECACHE_URLS = [
  "/",
  "/menu",
  "/offline.html",
];

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {
        // Non-fatal: some precache URLs may 404 during dev
      })
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: prune old caches ────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategies ─────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept non-GET or cross-origin requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API: always go to network — never serve stale order/menu data from cache
  if (url.pathname.startsWith("/api/")) return;

  // Static assets (hashed filenames from Vite build): cache-first
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(woff2?|ttf|otf|png|jpg|jpeg|webp|svg|ico|gif)(\?.*)?$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation (HTML documents): network-first, offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached ?? caches.match("/offline.html"))
      )
    );
    return;
  }
});
