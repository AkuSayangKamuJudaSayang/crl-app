"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let cancelled = false;

    const registerServiceWorker = async () => {
      try {
        const registration =
          await navigator.serviceWorker.register(
            "/sw.js",
            {
              scope: "/",
            }
          );

        if (cancelled) {
          return;
        }

        /*
         * Check for a newer service worker periodically while the app
         * remains open. This helps updated Vercel deployments replace
         * older cached versions.
         */
        const checkForUpdates = async () => {
          try {
            await registration.update();
          } catch {
            // Ignore update failures. The current worker remains usable.
          }
        };

        await checkForUpdates();

        const updateInterval = window.setInterval(
          checkForUpdates,
          5 * 60 * 1000
        );

        /*
         * Ask an installed waiting worker to activate immediately.
         */
        if (registration.waiting) {
          registration.waiting.postMessage({
            type: "SKIP_WAITING",
          });
        }

        registration.addEventListener(
          "updatefound",
          () => {
            const newWorker =
              registration.installing;

            if (!newWorker) {
              return;
            }

            newWorker.addEventListener(
              "statechange",
              () => {
                if (
                  newWorker.state ===
                  "installed"
                ) {
                  if (
                    navigator.serviceWorker
                      .controller &&
                    registration.waiting
                  ) {
                    registration.waiting.postMessage(
                      {
                        type:
                          "SKIP_WAITING",
                      }
                    );
                  }
                }
              }
            );
          }
        );

        return () => {
          window.clearInterval(
            updateInterval
          );
        };
      } catch (error) {
        console.error(
          "CRL-App service worker registration failed:",
          error
        );
      }
    };

    let cleanup;

    registerServiceWorker().then(
      (cleanupFunction) => {
        cleanup = cleanupFunction;
      }
    );

    return () => {
      cancelled = true;

      if (typeof cleanup === "function") {
        cleanup();
      }
    };
  }, []);

  return null;
}