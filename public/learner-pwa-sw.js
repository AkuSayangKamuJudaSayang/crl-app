const CACHE_NAME = "crl-app-learner-offline-v14";
const SHELL_URL = "/learner";
const ICON_URLS = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/crl-app-logo.png",
];

function learnerPath(url) {
  return url.pathname === "/learner" || url.pathname.startsWith("/learner/");
}

function learnerClient(client) {
  if (!client) return false;
  try { return learnerPath(new URL(client.url)); } catch { return false; }
}

function learnerRequest(event, url) {
  if (learnerPath(url)) return true;
  try { return learnerClient(event.clientId ? null : null) || learnerPath(new URL(event.request.referrer || "", self.location.origin)); } catch { return false; }
}

async function putIfOk(cache, request, response) {
  if (response && response.ok) {
    try { await cache.put(request, response.clone()); } catch {}
  }
  return response;
}

async function warmShell(cache) {
  try {
    const response = await fetch(SHELL_URL, { cache: "no-store" });
    if (!response.ok) return;
    await cache.put(SHELL_URL, response.clone());
    const html = await response.clone().text();
    const assets = new Set();
    for (const match of html.matchAll(/(?:src|href)=["'](\/_next\/[^"']+)["']/g)) assets.add(match[1]);
    for (const asset of assets) {
      try {
        const result = await fetch(asset, { cache: "no-store" });
        await putIfOk(cache, asset, result);
      } catch {}
    }
  } catch {}
  for (const url of ICON_URLS) {
    try { await putIfOk(cache, url, await fetch(url, { cache: "no-store" })); } catch {}
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(warmShell)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("crl-app-learner-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The root-scoped worker is intentionally passive for teacher/root traffic.
  const isLearnerDocument = request.mode === "navigate" && url.pathname === "/learner";
  const isStaticAsset = url.pathname.startsWith("/_next/") || url.pathname.startsWith("/icons/") || url.pathname === "/crl-app-logo.png";
  const referrerLearner = (() => {
    try { return learnerPath(new URL(request.referrer || self.location.origin, self.location.origin)); } catch { return false; }
  })();

  if (!isLearnerDocument && !(isStaticAsset && referrerLearner)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (isLearnerDocument) {
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response.ok) await cache.put(SHELL_URL, response.clone());
        return response;
      } catch {
        const cached = await cache.match(SHELL_URL);
        return cached || new Response("CRL-App Learner is offline and has not been opened online on this device yet.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    }

    const cached = await cache.match(request);
    try {
      const network = await fetch(request, { cache: "no-store" });
      if (network.ok) await cache.put(request, network.clone());
      return network;
    } catch {
      return cached || Response.error();
    }
  })());
});
