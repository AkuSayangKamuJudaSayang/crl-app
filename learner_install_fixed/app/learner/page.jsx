"use client";

import { useEffect, useState } from "react";
import LearnerAssessmentPage from "./LearnerAssessmentPage";

const PWA_MARKER = "crl-app-learner-pwa";

function isInstalledDisplayMode() {
  if (typeof window === "undefined") return false;

  return Boolean(
    window.matchMedia?.(
      "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)"
    )?.matches || window.navigator.standalone === true
  );
}

export default function LearnerPage() {
  const [ready, setReady] = useState(false);
  const [appMode, setAppMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isPwaLaunch = params.get("pwa") === "1";
    const standalone = isInstalledDisplayMode();
    const remembered =
      window.localStorage.getItem(PWA_MARKER) === "1";

    const shouldOpenAssessment =
      isPwaLaunch || standalone || remembered;

    if (isPwaLaunch) {
      window.localStorage.setItem(PWA_MARKER, "1");

      // The manifest uses ?pwa=1 only as a launch discriminator. Once the
      // installed app is established, keep the visible address exactly
      // /learner as requested.
      window.history.replaceState({}, "", "/learner");
    }

    setAppMode(shouldOpenAssessment);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || appMode) return;
    window.location.replace("/learner/download");
  }, [ready, appMode]);

  if (!ready) return null;

  return appMode ? <LearnerAssessmentPage /> : null;
}
