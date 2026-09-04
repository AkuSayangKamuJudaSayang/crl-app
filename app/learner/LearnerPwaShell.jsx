"use client";

import { useEffect } from "react";

function isInstalledDisplayMode() {
  if (typeof window === "undefined") return false;

  return Boolean(
    window.matchMedia?.(
      "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)"
    )?.matches || window.navigator.standalone === true
  );
}

export default function LearnerPwaShell({ children }) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
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

    // Register the learner worker from the learner experience. The worker uses a
    // root scope but only changes responses for learner clients/routes.
    let registration;
    if ("serviceWorker" in navigator) {
      registration = navigator.serviceWorker
        .register("/learner-pwa-sw.js", { scope: "/" })
        .then((reg) => reg.update().catch(() => reg))
        .catch(() => undefined);
    }

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      html.style.overscrollBehaviorY = previous.htmlOverscroll;
      body.style.overscrollBehaviorY = previous.bodyOverscroll;
      html.style.touchAction = previous.htmlTouchAction;
      body.style.touchAction = previous.bodyTouchAction;
      body.style.overflow = previous.bodyOverflow;
      void registration;
    };
  }, []);

  return <>{children}</>;
}
