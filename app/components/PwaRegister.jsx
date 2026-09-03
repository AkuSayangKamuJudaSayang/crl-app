"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    let cleanupPullToRefresh = () => {};
    let cleanupServiceWorker = undefined;

    const isLearnerPath =
      window.location.pathname === "/learner" ||
      window.location.pathname.startsWith("/learner/");

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true;

    /*
     * CRL-App Learner must not use browser pull-to-refresh.
     * Apply this specifically to the learner route, and also in standalone
     * mode so an installed learner app behaves like an app instead of a page.
     */
    if (isLearnerPath || isStandalone) {
      const html = document.documentElement;
      const body = document.body;
      const previousHtmlOverscroll = html.style.overscrollBehaviorY;
      const previousBodyOverscroll = body.style.overscrollBehaviorY;
      const previousTouchAction = body.style.touchAction;
      let touchStartY = null;

      html.style.overscrollBehaviorY = "none";
      body.style.overscrollBehaviorY = "none";
      body.style.touchAction = "pan-x pan-y";

      const onTouchStart = (event) => {
        if (event.touches?.length === 1) {
          touchStartY = event.touches[0].clientY;
        } else {
          touchStartY = null;
        }
      };

      const onTouchMove = (event) => {
        if (touchStartY === null || event.touches?.length !== 1) {
          return;
        }

        const currentY = event.touches[0].clientY;
        const pullingDown = currentY > touchStartY;

        /*
         * At the top of the learner page, prevent the downward overscroll
         * gesture that browsers can interpret as pull-to-refresh.
         */
        if (window.scrollY <= 0 && pullingDown) {
          event.preventDefault();
        }
      };

      const onTouchEnd = () => {
        touchStartY = null;
      };

      document.addEventListener("touchstart", onTouchStart, {
        passive: true,
      });
      document.addEventListener("touchmove", onTouchMove, {
        passive: false,
      });
      document.addEventListener("touchend", onTouchEnd, {
        passive: true,
      });
      document.addEventListener("touchcancel", onTouchEnd, {
        passive: true,
      });

      cleanupPullToRefresh = () => {
        html.style.overscrollBehaviorY = previousHtmlOverscroll;
        body.style.overscrollBehaviorY = previousBodyOverscroll;
        body.style.touchAction = previousTouchAction;
        document.removeEventListener("touchstart", onTouchStart);
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchEnd);
      };
    }

    if (!("serviceWorker" in navigator)) {
      return () => cleanupPullToRefresh();
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        if (cancelled) {
          return undefined;
        }

        const checkForUpdates = async () => {
          try {
            await registration.update();
          } catch {
            // Keep the currently active worker when update checks fail.
          }
        };

        await checkForUpdates();

        const updateInterval = window.setInterval(
          checkForUpdates,
          5 * 60 * 1000
        );

        if (registration.waiting) {
          registration.waiting.postMessage({
            type: "SKIP_WAITING",
          });
        }

        const onUpdateFound = () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller &&
              registration.waiting
            ) {
              registration.waiting.postMessage({
                type: "SKIP_WAITING",
              });
            }
          });
        };

        registration.addEventListener("updatefound", onUpdateFound);

        return () => {
          window.clearInterval(updateInterval);
          registration.removeEventListener(
            "updatefound",
            onUpdateFound
          );
        };
      } catch (error) {
        console.error(
          "CRL-App service worker registration failed:",
          error
        );
        return undefined;
      }
    };

    registerServiceWorker().then((cleanup) => {
      cleanupServiceWorker = cleanup;
    });

    return () => {
      cancelled = true;
      cleanupPullToRefresh();
      if (typeof cleanupServiceWorker === "function") {
        cleanupServiceWorker();
      }
    };
  }, []);

  return null;
}
