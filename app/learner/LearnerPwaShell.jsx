"use client";

import { useEffect } from "react";
import LearnerInstallButton from "./LearnerInstallButton";

function isInstalledDisplayMode() {
  if (typeof window === "undefined") return false;

  return Boolean(
    window.matchMedia?.(
      "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)"
    )?.matches || window.navigator.standalone === true
  );
}

async function registerLearnerServiceWorker() {
  if (!("serviceWorker" in navigator)) return undefined;

  try {
    /*
     * Older CRL-App builds registered learner-pwa-sw.js at the root scope.
     * That competed with the main /sw.js registration and could prevent the
     * learner manifest from becoming installable. Remove only that old learner
     * worker; never unregister the main application worker.
     */
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => {
          const scope = String(registration.scope || "");
          const scriptUrl = String(
            registration.active?.scriptURL ||
              registration.waiting?.scriptURL ||
              registration.installing?.scriptURL ||
              ""
          );

          return (
            scope === `${window.location.origin}/` &&
            scriptUrl.endsWith("/learner-pwa-sw.js")
          );
        })
        .map((registration) => registration.unregister())
    );

    const registration = await navigator.serviceWorker.register(
      "/learner-pwa-sw.js",
      { scope: "/learner" }
    );

    try {
      await registration.update();
    } catch {
      // Keep the currently active learner worker when an update check fails.
    }

    return registration;
  } catch {
    return undefined;
  }
}

export default function LearnerPwaShell({ children }) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const path = window.location.pathname;
    const isLearnerAssessmentRoute = path === "/learner";
    const installed = isInstalledDisplayMode();

    const protectPullToRefresh =
      isLearnerAssessmentRoute && installed;

    const previous = {
      htmlOverscroll: html.style.overscrollBehaviorY,
      bodyOverscroll: body.style.overscrollBehaviorY,
      htmlTouchAction: html.style.touchAction,
      bodyTouchAction: body.style.touchAction,
      bodyOverflow: body.style.overflow,
    };

    if (protectPullToRefresh) {
      html.style.overscrollBehaviorY = "none";
      body.style.overscrollBehaviorY = "none";
      html.style.touchAction = "pan-x pan-y";
      body.style.touchAction = "pan-x pan-y";
      body.style.overflow = "hidden";
    }

    let startY = 0;
    const handleTouchStart = (event) => {
      if (!protectPullToRefresh || event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
    };

    const handleTouchMove = (event) => {
      if (!protectPullToRefresh || event.touches.length !== 1) return;
      const currentY = event.touches[0].clientY;
      if (currentY > startY && window.scrollY <= 0) {
        event.preventDefault();
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    void registerLearnerServiceWorker();

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      html.style.overscrollBehaviorY = previous.htmlOverscroll;
      body.style.overscrollBehaviorY = previous.bodyOverscroll;
      html.style.touchAction = previous.htmlTouchAction;
      body.style.touchAction = previous.bodyTouchAction;
      body.style.overflow = previous.bodyOverflow;
    };
  }, []);

  return (
    <>
      {children}
      <LearnerInstallButton />
    </>
  );
}
