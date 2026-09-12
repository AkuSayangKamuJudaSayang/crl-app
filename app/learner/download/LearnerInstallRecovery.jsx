"use client";

import { useEffect, useState } from "react";

function getBrowserName() {
  if (typeof navigator === "undefined") return "your browser";
  const ua = navigator.userAgent || "";
  if (/Brave/i.test(ua)) return "Brave";
  if (/Edg\//i.test(ua)) return "Microsoft Edge";
  if (/Chrome\//i.test(ua)) return "Google Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return "your browser";
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.(
      "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)"
    )?.matches || window.navigator.standalone === true
  );
}

export default function LearnerInstallRecovery() {
  const [showHelp, setShowHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/learner/download") return undefined;

    let deferredPrompt = null;
    let button = null;
    let status = null;
    let observer = null;

    const syncButton = () => {
      button = document.querySelector("button.download");
      status = document.querySelector(".status[aria-live='polite']");

      // The download page's button intentionally disables itself until the
      // browser exposes beforeinstallprompt. Keep it usable so browsers that
      // do not expose that event can still receive installation guidance.
      if (button) {
        button.disabled = false;
        if (isStandalone()) {
          button.disabled = true;
        }
      }

      if (status && !isStandalone() && !deferredPrompt) {
        status.textContent = "Use your browser menu to install";
      }
    };

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      deferredPrompt = event;
      syncButton();
      if (status) status.textContent = "Ready to install";
    };

    const onInstalled = () => {
      deferredPrompt = null;
      setInstalled(true);
      syncButton();
      if (status) status.textContent = "CRL-App Learner is ready";
    };

    const onButtonClick = async (event) => {
      const target = event.target instanceof Element ? event.target.closest("button.download") : null;
      if (!target) return;

      // Intercept before the page's own handler. This guarantees that the
      // recovery path works even when the page did not receive
      // beforeinstallprompt during its first render.
      event.preventDefault();
      event.stopPropagation();

      if (isStandalone() || installed) return;

      if (deferredPrompt) {
        try {
          await deferredPrompt.prompt();
          await deferredPrompt.userChoice;
        } catch {}
        deferredPrompt = null;
        syncButton();
        if (status) status.textContent = "";
        return;
      }

      setShowHelp(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    document.addEventListener("click", onButtonClick, true);

    syncButton();
    observer = new MutationObserver(syncButton);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      document.removeEventListener("click", onButtonClick, true);
    };
  }, [installed]);

  if (!showHelp) return null;

  const browser = getBrowserName();
  const isIos = /iPad|iPhone|iPod/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");

  return (
    <div
      role="presentation"
      onClick={() => setShowHelp(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20000,
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: "rgba(8,29,54,.52)",
        backdropFilter: "blur(9px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="learner-install-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(460px, 100%)",
          padding: 26,
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,.72)",
          background: "rgba(255,255,255,.96)",
          boxShadow: "0 28px 80px rgba(7,39,88,.28)",
          color: "#14253d",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".13em", color: "#1559a6" }}>
          INSTALL CRL-APP LEARNER
        </div>
        <h2 id="learner-install-title" style={{ margin: "7px 0 9px", fontSize: 24, lineHeight: 1.1 }}>
          Install from {browser}
        </h2>
        <p style={{ margin: 0, color: "#68798f", fontSize: 13, lineHeight: 1.55 }}>
          This browser did not expose its automatic install prompt. The app is still installable from the browser menu.
        </p>

        {isIos ? (
          <ol style={{ margin: "17px 0 0", paddingLeft: 20, color: "#334960", fontSize: 13, lineHeight: 1.65 }}>
            <li>Tap Share in Safari.</li>
            <li>Choose <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong>.</li>
          </ol>
        ) : (
          <ol style={{ margin: "17px 0 0", paddingLeft: 20, color: "#334960", fontSize: 13, lineHeight: 1.65 }}>
            <li>Open the browser menu.</li>
            <li>Choose <strong>Install CRL-App Learner</strong>, <strong>Install app</strong>, or <strong>Add to Home screen</strong>.</li>
            <li>Confirm the installation.</li>
          </ol>
        )}

        <button
          type="button"
          onClick={() => setShowHelp(false)}
          style={{
            width: "100%",
            minHeight: 44,
            marginTop: 18,
            border: 0,
            borderRadius: 10,
            background: "linear-gradient(135deg,#1255aa,#2479db)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
