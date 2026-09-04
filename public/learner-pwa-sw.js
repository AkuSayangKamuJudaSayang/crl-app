const CACHE_NAME = "crl-app-learner-v8";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Network-only keeps Next.js navigation and API responses fresh and avoids
  // an old download page being served as the installed learner application.
  event.respondWith(fetch(event.request));
});
