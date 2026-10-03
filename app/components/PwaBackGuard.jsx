"use client";

import { useEffect } from "react";

function isInstalledPwa() {
  if (typeof window === "undefined") return false;

  return Boolean(
    window.matchMedia?.(
      "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)"
    )?.matches || window.navigator.standalone === true
  );
}

/**
 * Keeps the device back gesture inside the installed app. Each back request is
 * forwarded to the active page so it can dismiss its topmost overlay or move
 * one level back without closing the PWA window.
 */
export default function PwaBackGuard() {
  useEffect(() => {
    if (!isInstalledPwa()) return undefined;

    const rootState = {
      ...(window.history.state || {}),
      __crlPwaRoot: true,
    };
    const guardedState = {
      ...rootState,
      __crlPwaGuard: true,
    };

    window.history.replaceState(rootState, "", window.location.href);
    window.history.pushState(guardedState, "", window.location.href);

    const handleBack = () => {
      window.dispatchEvent(new CustomEvent("crl-pwa-back"));
      window.history.pushState(
        {
          ...(window.history.state || rootState),
          __crlPwaGuard: true,
        },
        "",
        window.location.href
      );
    };

    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);

  return null;
}
