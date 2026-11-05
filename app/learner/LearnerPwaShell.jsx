"use client";

import { useEffect } from "react";
import LearnerClipboardGuard from "./LearnerClipboardGuard";
import LearnerInstallButton from "./LearnerInstallButton";
import PwaBackGuard from "../components/PwaBackGuard";
import { registerLearnerServiceWorker, watchLearnerWorker } from "../../lib/learnerWorker";
import { canConsumeVerticalTouch } from "../../lib/touchScroll";

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

    let previousY = 0;
    const handleTouchStart = (event) => {
      if (!protectPullToRefresh || event.touches.length !== 1) return;
      previousY = event.touches[0].clientY;
    };

    const handleTouchMove = (event) => {
      if (!protectPullToRefresh || event.touches.length !== 1) return;
      const currentY = event.touches[0].clientY;
      const delta = currentY - previousY;
      previousY = currentY;
      if (delta > 0 && window.scrollY <= 0 && !canConsumeVerticalTouch(event.target, delta)) {
        if (!event.cancelable) return;
        event.preventDefault();
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    let cancelled=false,stopWorker=()=>{};
    void registerLearnerServiceWorker().then(registration=>{
      if(!cancelled&&registration)stopWorker=watchLearnerWorker(registration);
    });

    return () => {
      cancelled=true;stopWorker();
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
      <PwaBackGuard />
      <LearnerClipboardGuard />
      {children}
      <LearnerInstallButton />
    </>
  );
}
