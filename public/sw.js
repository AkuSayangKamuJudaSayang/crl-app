const CACHE_NAME = "crla-pwa-v10";

const APP_SHELL = [
  "/",
  "/login",
  "/learner",
  "/teacher",
  "/teacher/assessment",
  "/login-slides/learners-1.svg",
  "/login-slides/learners-2.svg",
  "/login-slides/learners-3.svg",
];

const NEVER_CACHE_PREFIXES = [
  "/api/",
  "/_next/",
];

function shouldNeverCache(url) {
  return NEVER_CACHE_PREFIXES.some(
    (prefix) =>
      url.pathname === prefix ||
      url.pathname.startsWith(prefix)
  );
}

async function clearOldCaches() {
  const keys =
    await caches.keys();

  await Promise.all(
    keys
      .filter(
        (key) =>
          key.startsWith("crla-pwa-") &&
          key !== CACHE_NAME
      )
      .map((key) =>
        caches.delete(key)
      )
      );
}

async function cacheResponse(
  request,
  response
) {
  if (
    !response ||
    !response.ok
  ) {
    return;
  }

  try {
    const cache =
      await caches.open(
        CACHE_NAME
      );

    await cache.put(
      request,
      response.clone()
    );
  } catch {
    /*
     * Cache storage may be unavailable in some browser/private modes.
     * The network response is still returned to the user.
     */
  }
}

self.addEventListener(
  "install",
  (event) => {
    self.skipWaiting();

    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) =>
          cache.addAll(
            APP_SHELL
          )
        )
        .catch(() => {
          /*
           * An unavailable shell resource should not prevent
           * the worker from installing. Next.js can still serve
           * the page directly from the network.
           */
        })
    );
  }
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      clearOldCaches()
        .then(() =>
          self.clients.claim()
        )
    );
  }
);

self.addEventListener(
  "fetch",
  (event) => {
    const request =
      event.request;

    /*
     * Only handle same-origin GET requests.
     * External resources should go directly to their own origin.
     */
    if (
      request.method !==
        "GET" ||
      new URL(
        request.url
      ).origin !==
        self.location.origin
    ) {
      return;
    }

    const url =
      new URL(
        request.url
      );

    /*
     * CRITICAL:
     * Assessment, authentication, database health checks,
     * Excel reports, and all other APIs must always reach
     * the server. Never return stale API data from PWA cache.
     */
    if (
      shouldNeverCache(
        url
      )
    ) {
      event.respondWith(
        fetch(request, {
          cache: "no-store",
        })
      );
      return;
    }

    /*
     * Next.js application routes should prefer the network so
     * that deployments are reflected immediately. The previously
     * cached page is used only as an offline fallback.
     */
    event.respondWith(
      fetch(request)
        .then(
          async (response) => {
            await cacheResponse(
              request,
              response
            );

            return response;
          }
        )
        .catch(async () => {
          const cached =
            await caches.match(
              request
            );

          if (cached) {
            return cached;
          }

          /*
           * For navigations, fall back to the cached login page
           * instead of displaying a blank offline response.
           */
          if (
            request.mode ===
            "navigate"
          ) {
            const login =
              await caches.match(
                "/login"
              );

            if (login) {
              return login;
            }
          }

          return new Response(
            "CRL-App is currently offline.",
            {
              status: 503,
              headers: {
                "Content-Type":
                  "text/plain; charset=utf-8",
              },
            }
          );
        })
    );
  }
);

self.addEventListener(
  "message",
  (event) => {
    if (
      event.data?.type ===
      "SKIP_WAITING"
    ) {
      self.skipWaiting();
    }

    if (
      event.data?.type ===
      "CLEAR_CRLA_CACHE"
    ) {
      event.waitUntil(
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) =>
                  key.startsWith(
                    "crla-pwa-"
                  )
                )
                .map((key) =>
                  caches.delete(
                    key
                  )
                )
            )
          )
      );
    }
  }
);
