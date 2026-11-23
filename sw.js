/* Mosafir service worker: app shell precache + network-first data.
   Bump VERSION whenever you change index.html, CSS, JS or icons so clients pick up the update. */
const VERSION = "v1";
const SHELL_CACHE = `mosafir-shell-${VERSION}`;
const DATA_CACHE = `mosafir-data-${VERSION}`;
const FONT_CACHE = "mosafir-fonts";            // kept across versions
const DATA_PATH = "data/departures.json";

// Paths are relative to the SW location, so this works under /mosafir/ (GitHub Pages) and http://localhost/mosafir/.
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/css/style.css",
  "assets/js/i18n.js",
  "assets/js/app.js",
  "assets/img/favicon.svg",
  "assets/icons/favicon-32.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
  "assets/icons/apple-touch-icon.png",
  DATA_PATH,
];
const abs = (p) => new URL(p, self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL.filter((p) => p !== DATA_PATH).map((p) => new Request(abs(p), { cache: "reload" })));
    const data = await caches.open(DATA_CACHE);
    try { await data.add(new Request(abs(DATA_PATH), { cache: "reload" })); } catch (e) { /* offline install: data cached on first fetch */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL_CACHE, DATA_CACHE, FONT_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("mosafir-") && !keep.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(fallbackUrl || request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(fallbackUrl || request, { ignoreSearch: true });
    if (!hit) throw e;
    // tell the page this came from the offline cache
    const headers = new Headers(hit.headers); headers.set("X-Mosafir-Offline", "1");
    return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
  }
}
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: true });
  const net = fetch(request).then((res) => { if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: cache-first-ish (system fonts are the fallback when not cached)
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;

  // Timetable data: network first, cached copy when offline
  if (url.href.split("?")[0] === abs(DATA_PATH)) {
    event.respondWith(networkFirst(req, DATA_CACHE, abs(DATA_PATH)));
    return;
  }
  // Page navigations (any ?lang=&q=… query): network first, fall back to cached index.html
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, SHELL_CACHE, abs("index.html")).catch(async () => (await caches.match(abs("./"))) || Response.error()));
    return;
  }
  // Static shell assets
  event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});

self.addEventListener("message", (event) => { if (event.data === "skipWaiting") self.skipWaiting(); });
