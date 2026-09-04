"use client";

import { useEffect, useState } from "react";

function getStandaloneState() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true
  );
}

export default function LearnerPwaShell({ children }) {
  const [ready, setReady] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const isStandalone = getStandaloneState();
    setStandalone(isStandalone);
    setReady(true);

    if (!isStandalone) {
      window.location.replace("/learner/download");
      return undefined;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/learner-pwa-sw.js", { scope: "/learner" })
        .catch(() => undefined);
    }

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
    let startScrollY = 0;

    const handleTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
      startScrollY = window.scrollY;
    };

    const handleTouchMove = (event) => {
      if (event.touches.length !== 1) return;
      const currentY = event.touches[0].clientY;
      const pullingDown = currentY > startY;
      if (pullingDown && startScrollY <= 0 && window.scrollY <= 0) {
        event.preventDefault();
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      html.style.overscrollBehaviorY = previous.htmlOverscroll;
      body.style.overscrollBehaviorY = previous.bodyOverscroll;
      html.style.touchAction = previous.htmlTouchAction;
      body.style.touchAction = previous.bodyTouchAction;
    };
  }, []);

  if (!ready) {
    return <div aria-hidden="true" style={{ minHeight: "100svh" }} />;
  }

  if (!standalone) {
    return null;
  }

  return children;
}
