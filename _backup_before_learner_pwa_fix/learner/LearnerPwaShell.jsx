"use client";

import { useEffect } from "react";

export default function LearnerPwaShell({ children }) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverscroll: html.style.overscrollBehaviorY,
      bodyOverscroll: body.style.overscrollBehaviorY,
      htmlTouchAction: html.style.touchAction,
      bodyTouchAction: body.style.touchAction,
    };

    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";
    html.style.touchAction = "pan-x pan-y";
    body.style.touchAction = "pan-x pan-y";

    let startY = 0;

    const handleTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
    };

    const handleTouchMove = (event) => {
      if (event.touches.length !== 1) return;
      const currentY = event.touches[0].clientY;
      if (currentY > startY && window.scrollY <= 0) {
        event.preventDefault();
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    let registration;
    if ("serviceWorker" in navigator) {
      registration = navigator.serviceWorker.register("/learner-pwa-sw.js", {
        scope: "/learner",
      }).catch(() => undefined);
    }

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      html.style.overscrollBehaviorY = previous.htmlOverscroll;
      body.style.overscrollBehaviorY = previous.bodyOverscroll;
      html.style.touchAction = previous.htmlTouchAction;
      body.style.touchAction = previous.bodyTouchAction;
      void registration;
    };
  }, []);

  return <>{children}</>;
}
