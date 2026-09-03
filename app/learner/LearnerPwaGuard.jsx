"use client";

import { useEffect } from "react";

const LEARNER_PATH = "/learner";

export default function LearnerPwaGuard() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    // The learner PWA always starts and stays on the learner entry route.
    // This also normalizes /learner/ to the exact requested /learner URL.
    const pathname = window.location.pathname;
    if (pathname === "/learner/") {
      window.history.replaceState(window.history.state, "", LEARNER_PATH);
    } else if (pathname !== LEARNER_PATH) {
      window.location.replace(LEARNER_PATH);
      return undefined;
    } else if (window.location.search || window.location.hash) {
      window.history.replaceState(window.history.state, "", LEARNER_PATH);
    }

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverscroll = html.style.overscrollBehaviorY;
    const previousBodyOverscroll = body.style.overscrollBehaviorY;
    const previousTouchAction = body.style.touchAction;

    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";
    body.style.touchAction = "pan-x pan-y";

    let touchStartY = null;

    const onTouchStart = (event) => {
      if (event.touches?.length === 1) {
        touchStartY = event.touches[0].clientY;
      }
    };

    const onTouchMove = (event) => {
      if (touchStartY === null || event.touches?.length !== 1) {
        return;
      }

      const currentY = event.touches[0].clientY;
      const pullingDown = currentY > touchStartY;

      // Stop Android/browser pull-to-refresh when the page is already at the top.
      if (window.scrollY <= 0 && pullingDown) {
        event.preventDefault();
      }
    };

    const onTouchEnd = () => {
      touchStartY = null;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      html.style.overscrollBehaviorY = previousHtmlOverscroll;
      body.style.overscrollBehaviorY = previousBodyOverscroll;
      body.style.touchAction = previousTouchAction;
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return null;
}
