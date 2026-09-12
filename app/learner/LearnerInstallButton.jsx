"use client";

import { useEffect, useState } from "react";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.(
      "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)"
    )?.matches || window.navigator.standalone === true
  );
}

function getBrowserName() {
  if (typeof navigator === "undefined") return "your browser";
  const ua = navigator.userAgent || "";
  if (/Brave/i.test(ua)) return "Brave";
  if (/Edg\//i.test(ua)) return "Microsoft Edge";
  if (/Chrome\//i.test(ua)) return "Google Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return "your browser";
}

export default function LearnerInstallButton() {
  const [ready, setReady] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const standalone = isStandalone();
    setInstalled(standalone);
    setReady(true);

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
      setShowHelp(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (!ready || installed) return null;

  async function handleInstall() {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch {
        // The browser may dismiss or reject the native install prompt.
      } finally {
        setDeferredPrompt(null);
      }
      return;
    }

    setShowHelp(true);
  }

  return (
    <>
      <div className="learner-install-wrap">
        <button
          type="button"
          className="learner-install-button"
          onClick={handleInstall}
          aria-label="Install CRL-App Learner"
        >
          <span aria-hidden="true">📲</span>
          <span>Install CRL-App Learner</span>
        </button>
      </div>

      {showHelp && (
        <div
          className="learner-install-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="learner-install-title"
          onClick={() => setShowHelp(false)}
        >
          <div className="learner-install-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="learner-install-icon" aria-hidden="true">📲</div>
            <div className="learner-install-eyebrow">INSTALL CRL-APP LEARNER</div>
            <h2 id="learner-install-title">Install from {getBrowserName()}</h2>
            <p>
              Your browser did not expose its automatic install prompt yet. You can still install CRL-App Learner directly from this learner page.
            </p>
            <ol>
              <li>Open the browser menu.</li>
              <li>Choose <strong>Install CRL-App Learner</strong>, <strong>Install app</strong>, or <strong>Add to Home screen</strong>.</li>
              <li>Confirm the installation.</li>
            </ol>
            <button type="button" className="learner-install-close" onClick={() => setShowHelp(false)}>
              Got it
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .learner-install-wrap {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 9000;
          display: flex;
          justify-content: flex-end;
          pointer-events: none;
        }

        .learner-install-button {
          pointer-events: auto;
          appearance: none;
          border: 1px solid rgba(21, 89, 166, 0.2);
          border-radius: 14px;
          padding: 10px 14px;
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.94);
          color: #1559a6;
          font-weight: 850;
          font-size: 13px;
          cursor: pointer;
          box-shadow: 0 10px 28px rgba(21, 89, 166, 0.15);
          backdrop-filter: blur(12px);
          transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
        }

        .learner-install-button:hover {
          transform: translateY(-1px);
          background: #fff;
          box-shadow: 0 14px 32px rgba(21, 89, 166, 0.2);
        }

        .learner-install-button:active {
          transform: translateY(0) scale(0.99);
        }

        .learner-install-overlay {
          position: fixed;
          inset: 0;
          z-index: 12000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(8, 20, 34, 0.55);
          backdrop-filter: blur(8px);
        }

        .learner-install-dialog {
          width: min(100%, 440px);
          border-radius: 22px;
          background: #fff;
          color: #18324f;
          padding: 26px;
          box-shadow: 0 26px 80px rgba(0, 0, 0, 0.24);
        }

        .learner-install-icon {
          width: 52px;
          height: 52px;
          border-radius: 15px;
          display: grid;
          place-items: center;
          background: #eef5ff;
          font-size: 25px;
          margin-bottom: 12px;
        }

        .learner-install-eyebrow {
          color: #1559a6;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.13em;
        }

        .learner-install-dialog h2 {
          margin: 7px 0 10px;
          font-size: 23px;
          line-height: 1.12;
        }

        .learner-install-dialog p,
        .learner-install-dialog ol {
          margin: 0;
          line-height: 1.55;
          font-size: 13px;
        }

        .learner-install-dialog p { color: #65778d; }
        .learner-install-dialog ol { margin-top: 14px; padding-left: 19px; color: #334960; }
        .learner-install-dialog li + li { margin-top: 5px; }

        .learner-install-close {
          margin-top: 18px;
          width: 100%;
          min-height: 44px;
          border: 0;
          border-radius: 11px;
          background: #1559a6;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }

        @media (max-width: 620px) {
          .learner-install-wrap { top: 10px; right: 10px; left: 10px; justify-content: center; }
          .learner-install-button { width: 100%; max-width: 320px; }
        }
      `}</style>
    </>
  );
}
