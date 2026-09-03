/*
 * Dedicated service worker scope for CRL-App Learner.
 *
 * It intentionally does not install a navigation fallback or redirect.
 * The learner PWA must remain on /learner and must never fall back to /login.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
