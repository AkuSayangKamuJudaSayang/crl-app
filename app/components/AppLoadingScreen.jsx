"use client";

import { useEffect, useState } from "react";

const LOADER_CSS = `
  .crlAppLoader {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: grid;
    place-items: center;
    background: #fffdf7;
    color: #1a2b4c;
    font-family: var(--font-outfit), Outfit, Arial, sans-serif;
    opacity: 1;
    transition: opacity 160ms ease-out;
  }

  .crlAppLoaderLeaving {
    pointer-events: none;
    opacity: 0;
  }

  .crlAppLoaderStatus {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 15px;
    border: 1px solid #d7e0eb;
    border-radius: 12px;
    background: #ffffff;
    font-size: 13px;
    font-weight: 700;
  }

  .crlAppLoaderSpinner {
    width: 16px;
    height: 16px;
    box-sizing: border-box;
    border: 2px solid #cbd7e4;
    border-top-color: #2b5c88;
    border-radius: 50%;
    animation: crlAppLoaderSpin 700ms linear infinite;
  }

  @keyframes crlAppLoaderSpin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .crlAppLoader { transition-duration: 0.01ms; }
    .crlAppLoaderSpinner { animation: none; }
  }
`;

export default function AppLoadingScreen() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let removeTimer;

    const updateConnection = () => setOnline(navigator.onLine);
    const finishLoading = () => {
      setLeaving(true);
      removeTimer = window.setTimeout(() => setVisible(false), 160);
    };

    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    if (document.readyState === "complete") {
      finishLoading();
    } else {
      window.addEventListener("load", finishLoading, { once: true });
    }

    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener("load", finishLoading);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`crlAppLoader${leaving ? " crlAppLoaderLeaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={online ? "Loading teacher workspace" : "Loading saved teacher workspace offline"}
    >
      <style dangerouslySetInnerHTML={{ __html: LOADER_CSS }} />
      <div className="crlAppLoaderStatus">
        <span className="crlAppLoaderSpinner" aria-hidden="true" />
        <span>{online ? "Loading teacher workspace…" : "Offline — loading saved workspace…"}</span>
      </div>
    </div>
  );
}
