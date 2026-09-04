"use client";

import { useEffect, useState } from "react";
import LearnerAssessmentPage from "./LearnerAssessmentPage";

function isStandalone() {
  if (typeof window === "undefined") return false;

  return Boolean(
    window.matchMedia?.(
      "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui), (display-mode: window-controls-overlay)"
    )?.matches || window.navigator.standalone === true
  );
}

export default function LearnerPage() {
  const [ready, setReady] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const appInstalled = isStandalone();
    setStandalone(appInstalled);
    setReady(true);

    if (appInstalled && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/learner-pwa-sw.js", {
          scope: "/learner",
          updateViaCache: "none",
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!ready || standalone) return;
    window.location.replace("/learner/download");
  }, [ready, standalone]);

  if (!ready || !standalone) return null;

  return <LearnerAssessmentPage />;
}
