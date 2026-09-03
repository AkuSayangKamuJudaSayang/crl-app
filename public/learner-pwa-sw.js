const CACHE_NAME = "crl-app-learner-v1";
const LEARNER_SCOPE = "/learner";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (
    requestUrl.origin !== self.location.origin ||
    !(requestUrl.pathname === LEARNER_SCOPE || requestUrl.pathname.startsWith(`${LEARNER_SCOPE}/`))
  ) {
    return;
  }

  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copy).catch(() => {});
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
