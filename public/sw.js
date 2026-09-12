const CACHE_NAME = "crla-pwa-v14";

const APP_SHELL = [
  "/",
  "/login",
  "/learner",
  "/teacher",
  "/teacher/assessment",
  "/manifest.webmanifest",
  "/login-slides/learners-1.svg",
  "/login-slides/learners-2.svg",
  "/login-slides/learners-3.svg",
  "/login-slides/classroom-1.png",
  "/login-slides/classroom-2.png",
  "/login-slides/classroom-3.png",
];

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|ttf|css|js)$/.test(url.pathname);
}

function shouldBypass(url) {
  return url.pathname === "/api/" || url.pathname.startsWith("/api/");
}

async function clearOldCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith("crla-pwa-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key))
  );
}

async function cacheResponse(request, response) {
  if (!response?.ok) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {
    // Cache storage can be unavailable in private browsing modes.
  }
}

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(urls.map(async (resource) => {
    try {
      const request = new Request(resource, { credentials: "same-origin" });
      const response = await fetch(request, { cache: "no-store" });
      if (response.ok) await cache.put(request, response.clone());
    } catch {
      // One unavailable resource must not cancel the rest of the warm-up.
    }
  }));
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clearOldCaches().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // APIs remain network-only. The application layer mirrors their data to
  // IndexedDB and provides an offline response when appropriate.
  if (shouldBypass(url)) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  // Next static chunks and app assets are cache-first after the first successful
  // load. This is required for an installed PWA to boot without a network.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then(async (response) => {
        await cacheResponse(request, response);
        return response;
      }))
    );
    return;
  }

  // Application documents use network-first online and cached fallback offline.
  event.respondWith(
    fetch(request)
      .then(async (response) => {
        await cacheResponse(request, response);
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          return (await caches.match("/teacher")) || (await caches.match("/login")) || new Response("CRL-App is offline.", { status: 503 });
        }
        return new Response("CRL-App is offline.", { status: 503 });
      })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();

  if (event.data?.type === "WARM_CRLA_APP") {
    event.waitUntil(cacheUrls(APP_SHELL));
  }

  if (event.data?.type === "CLEAR_CRLA_CACHE") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("crla-pwa-")).map((key) => caches.delete(key))
      ))
    );
  }
});
